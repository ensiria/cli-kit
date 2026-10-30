/**
 * The spinner: Kaji UI's waves while something runs, then one line saying how it ended.
 *
 * @remarks
 * On an interactive terminal the frames (`SPINNER`) turn on stderr and are erased at the end; elsewhere (a pipe, CI,
 * `--quiet`) the start is one `step` line and the end one result line, so a log stays readable. Ctrl+C erases the
 * frame and shows the cursor (through `onExit`).
 *
 * @module
 */
import { SPINNER } from "./constants.ts";
import { pick } from "./glyphs.ts";
import { canAnimate, createLiveRegion, startLiveRun } from "./live.ts";
import type { LiveTarget } from "./live.types.ts";
import type { Spinner } from "./spinner.types.ts";
import { paint } from "./style.ts";

/**
 * Starts a spinner.
 *
 * @param text - What is happening (`Building the catalogue`).
 * @param target - The run (`io`, `log`, `onExit`): a script passes its context.
 * @returns The spinner.
 * @example
 * ```ts
 * const spin = spinner("Fetching tags", context);
 * try { await fetchTags(); spin.succeed("Tags fetched"); } catch (error) { spin.fail(); throw error; }
 * ```
 */
export const spinner = (text: string, target: LiveTarget): Spinner => {
  const { log } = target;
  const isLive = canAnimate(target);
  const frames = pick(SPINNER, log.style.unicode);
  const region = createLiveRegion(target.io.stderr, log.style.unicode);
  let current = text;
  let frame = 0;
  const draw = (): void => {
    region.render([
      `${paint("accent", frames[frame % frames.length] ?? "", log.errorStyle.color)} ${current}`
    ]);
  };
  const nextFrame = (): void => {
    frame += 1;
    draw();
  };
  const run = startLiveRun(
    target,
    region,
    isLive ? { tick: nextFrame, everyMs: SPINNER.interval } : undefined
  );
  if (isLive) draw();
  else log.step(text);
  const finish =
    (print: (message: string) => void): ((message?: string) => void) =>
    (message?: string): void => {
      if (!run.isRunning()) return;
      run.end();
      print(message ?? current);
    };
  return {
    update: (next: string): void => {
      current = next;
      if (isLive && run.isRunning()) draw();
    },
    succeed: finish(log.success),
    fail: finish(log.error),
    warn: finish(log.warn),
    stop: run.end
  };
};
