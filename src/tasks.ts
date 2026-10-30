/**
 * The task list: a step list like Kaji UI's `StepList` (pending, running, done, failed, skipped), nested, with
 * optional concurrency.
 *
 * @remarks
 * On an interactive terminal the whole list is redrawn in place on stderr, the running tasks spinning, then printed
 * once in its final state. In a pipe or CI each task prints a line when it starts and when it ends, so the log reads
 * top to bottom. A failed task stops the tasks not yet started (unless `continueOnError`) and the list throws a
 * `ScriptError` naming it.
 *
 * @module
 */
import { SPINNER } from "./constants.ts";
import { formatDuration } from "./format.ts";
import { glyph, pick } from "./glyphs.ts";
import { canAnimate, createLiveRegion } from "./live.ts";
import type { LiveTarget } from "./live.types.ts";
import { ScriptError } from "./script.ts";
import { paint } from "./style.ts";
import type { Task, TaskHandle, TaskResult, TaskStatus, TasksOptions } from "./tasks.types.ts";

/** A task while the list runs. */
interface TaskState {
  /** The definition. */
  readonly task: Task;
  /** Nesting level, for the indentation. */
  readonly depth: number;
  /** The current title. */
  title: string;
  /** A muted detail after the title. */
  detail: string;
  /** Where it is. */
  status: TaskStatus;
  /** When it started (epoch ms). */
  startedAt: number;
  /** How long it ran. */
  duration: number;
  /** What it threw. */
  error: unknown;
  /** Why it was skipped. */
  skipReason: string;
  /** Its subtasks. */
  readonly children: TaskState[];
}

/** The glyph and tone of each finished or waiting status (running uses the spinner frame). */
const STATUS_LOOK: Readonly<
  Record<
    Exclude<TaskStatus, "running">,
    { glyph: "success" | "error" | "skipped" | "pending"; tone: "success" | "danger" | "muted" }
  >
> = {
  pending: { glyph: "pending", tone: "muted" },
  done: { glyph: "success", tone: "success" },
  failed: { glyph: "error", tone: "danger" },
  skipped: { glyph: "skipped", tone: "muted" }
};

/** The state of a task before it runs. */
const toState = (task: Task, depth: number): TaskState => ({
  task,
  depth,
  title: task.title,
  detail: "",
  status: "pending",
  startedAt: 0,
  duration: 0,
  error: undefined,
  skipReason: "",
  children: (task.children ?? []).map((child) => toState(child, depth + 1))
});

/** The result of a finished list, from its states. */
const toResult = (state: TaskState): TaskResult => ({
  title: state.title,
  status: state.status,
  duration: state.duration,
  ...(state.error === undefined ? {} : { error: state.error }),
  children: state.children.map(toResult)
});

/** The message of anything thrown. */
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A task's title and facts (detail, duration, skip reason), without its mark. */
const taskText = (state: TaskState, color: boolean): string => {
  const isMuted = state.status === "pending" || state.status === "skipped";
  const facts: string[] = [];
  if (state.detail && state.status === "running") facts.push(state.detail);
  if (state.status === "done" || state.status === "failed") facts.push(formatDuration(state.duration));
  if (state.status === "skipped") facts.push(state.skipReason ? `skipped: ${state.skipReason}` : "skipped");
  const suffix = facts.length > 0 ? ` ${paint("muted", facts.join(" · "), color)}` : "";
  return `${isMuted ? paint("muted", state.title, color) : state.title}${suffix}`;
};

/** One line of the list: indentation, mark (the spinner frame while running) and text. */
const taskLine = (state: TaskState, runningMark: string, unicode: boolean, color: boolean): string => {
  const mark =
    state.status === "running"
      ? paint("accent", runningMark, color)
      : paint(STATUS_LOOK[state.status].tone, glyph(STATUS_LOOK[state.status].glyph, unicode), color);
  return `${"  ".repeat(state.depth)}${mark} ${taskText(state, color)}`;
};

/** Every state, depth first. */
const flatten = (states: readonly TaskState[]): TaskState[] =>
  states.flatMap((state) => [state, ...flatten(state.children)]);

/** Marks a state and its children skipped. */
const markSkipped = (state: TaskState, reason: string): void => {
  state.status = "skipped";
  state.skipReason = reason;
  for (const child of state.children) markSkipped(child, "");
};

/**
 * Runs a list of tasks, drawing their progress.
 *
 * @param list - The tasks, in order.
 * @param target - The run (`io`, `log`, `onExit`): a script passes its context.
 * @param options - Concurrency and whether to go on after a failure.
 * @returns How every task ended.
 * @throws ScriptError naming the first failed task, unless `continueOnError`.
 * @example
 * ```ts
 * await tasks([
 *   { title: "Tokens", run: buildTokens },
 *   { title: "Icons", children: [{ title: "Optimise", run: optimise }, { title: "Generate", run: generate }] }
 * ], context);
 * ```
 */
export const tasks = async (
  list: readonly Task[],
  target: LiveTarget,
  options: TasksOptions = {}
): Promise<TaskResult[]> => {
  const { log } = target;
  const isLive = canAnimate(target);
  const color = isLive ? log.errorStyle.color : log.style.color;
  const frames = pick(SPINNER, log.style.unicode);
  const region = createLiveRegion(target.io.stderr, log.style.unicode);
  const states = list.map((task) => toState(task, 0));
  let frame = 0;
  let shouldStop = false;

  const draw = (): void => {
    if (!isLive) return;
    const runningMark = frames[frame % frames.length] ?? "";
    region.render(flatten(states).map((state) => taskLine(state, runningMark, log.style.unicode, color)));
  };
  const announce = (state: TaskState): void => {
    if (isLive) {
      draw();
      return;
    }
    if (state.status === "failed") log.error(taskText(state, color));
    else log.plain(taskLine(state, glyph("step", log.style.unicode), log.style.unicode, color));
  };
  const interval = isLive
    ? setInterval(() => {
        frame += 1;
        draw();
      }, SPINNER.interval)
    : undefined;
  const stopDrawing = (): void => {
    clearInterval(interval);
    region.clear();
  };
  const removeCleanup = target.onExit?.(stopDrawing) ?? ((): void => undefined);

  const runOne = async (state: TaskState): Promise<void> => {
    const skip = await state.task.skip?.();
    if (skip) {
      markSkipped(state, typeof skip === "string" ? skip : "");
      announce(state);
      return;
    }
    state.status = "running";
    state.startedAt = Date.now();
    announce(state);
    const handle: TaskHandle = {
      setTitle: (title: string): void => {
        state.title = title;
        draw();
      },
      setDetail: (detail: string): void => {
        state.detail = detail;
        draw();
      }
    };
    try {
      await state.task.run?.(handle);
      await runAll(state.children, 1);
      const failedChild = state.children.find((child) => child.status === "failed");
      if (failedChild) throw failedChild.error;
      state.status = "done";
    } catch (error) {
      state.status = "failed";
      state.error = error;
      if (!options.continueOnError) shouldStop = true;
    }
    state.duration = Date.now() - state.startedAt;
    announce(state);
  };

  const runAll = async (group: readonly TaskState[], concurrency: number): Promise<void> => {
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < group.length && !shouldStop) {
        const state = group[next];
        next += 1;
        if (state) await runOne(state);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, group.length)) }, worker));
  };

  draw();
  try {
    await runAll(states, options.concurrency ?? 1);
  } finally {
    stopDrawing();
    removeCleanup();
  }
  if (isLive && !log.isQuiet) {
    for (const state of flatten(states)) log.plain(taskLine(state, "", log.style.unicode, log.style.color));
  }
  const failed = flatten(states).find(
    (state) => state.status === "failed" && state.children.every((c) => c.status !== "failed")
  );
  if (failed && !options.continueOnError) {
    throw new ScriptError(`${failed.title} failed: ${messageOf(failed.error)}`);
  }
  return states.map(toResult);
};
