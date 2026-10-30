/**
 * Elapsed time, for "done in 1.2 s" lines and the rates and estimates of the progress bar.
 *
 * @module
 */
import { formatDuration } from "./format.ts";
import type { Timer } from "./timer.types.ts";

/**
 * Starts a timer.
 *
 * @returns The timer, running from now.
 * @example
 * ```ts
 * const clock = timer();
 * await build();
 * log.success(`built in ${clock.format()}`);
 * ```
 */
export const timer = (): Timer => {
  let start = Date.now();
  const elapsed = (): number => Date.now() - start;
  return {
    elapsed,
    format: (): string => formatDuration(elapsed()),
    reset: (): void => {
      start = Date.now();
    }
  };
};
