/**
 * The types of the task list.
 *
 * @module
 */

/** Where a task is. */
export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

/** What a running task can do about itself. */
export interface TaskHandle {
  /** Changes the task's title (`Building 3/12`). */
  readonly setTitle: (title: string) => void;
  /** Shows a muted detail after the title (the file being processed). */
  readonly setDetail: (detail: string) => void;
}

/** One task of the list. */
export interface Task {
  /** What it does, shown in the list. */
  readonly title: string;
  /** The work; a task with `children` runs them after its own `run`. Throw to fail it. */
  readonly run?: ((task: TaskHandle) => void | Promise<void>) | undefined;
  /** Return true or a reason to skip the task (and its children). */
  readonly skip?: (() => boolean | string | Promise<boolean | string>) | undefined;
  /** Subtasks, drawn indented. */
  readonly children?: readonly Task[] | undefined;
}

/** Options of `tasks`. */
export interface TasksOptions {
  /** How many top-level tasks run at once. @defaultValue 1 */
  readonly concurrency?: number | undefined;
  /** Keep running the other tasks after one fails. @defaultValue false */
  readonly continueOnError?: boolean | undefined;
}

/** How a task ended. */
export interface TaskResult {
  /** The task's final title. */
  readonly title: string;
  /** Its final status (`pending` when it never ran because an earlier one failed). */
  readonly status: TaskStatus;
  /** Milliseconds it ran. */
  readonly duration: number;
  /** What it threw, when it failed. */
  readonly error?: unknown;
  /** Its subtasks. */
  readonly children: readonly TaskResult[];
}
