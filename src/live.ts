/**
 * The ground under every live helper: a block of lines redrawn in place, and the rule for when to animate.
 *
 * @remarks
 * Live output goes to stderr, so stdout keeps only results (and `--json` documents). It animates only on an
 * interactive terminal (not a pipe, not CI, not `TERM=dumb`) and not with `--quiet`; otherwise each helper prints
 * plain lines. Lines are cut to the terminal's width, since a wrapped line would break the redraw.
 *
 * @module
 */
import { ANSI } from "./constants.ts";
import { isInteractive, terminalWidth } from "./io.ts";
import type { OutputStream } from "./io.types.ts";
import type { LiveRegion, LiveRun, LiveTarget, LiveTicker } from "./live.types.ts";
import { stripAnsi, truncate, width } from "./text.ts";

/**
 * Whether a live helper should animate for this run.
 *
 * @param target - The run.
 * @returns True on an interactive stderr without `--quiet`.
 */
export const canAnimate = (target: LiveTarget): boolean =>
  !target.log.isQuiet && isInteractive(target.io.stderr, target.io.env);

/**
 * Creates a region of lines redrawn in place.
 *
 * @param stream - The terminal stream (stderr).
 * @param unicode - For the ellipsis of cut lines.
 * @returns The region.
 */
export const createLiveRegion = (stream: OutputStream, unicode: boolean): LiveRegion => {
  let drawn = 0;
  const erase = (): string => {
    if (drawn === 0) return "";
    return `${ANSI.clearLine}${`${ANSI.cursorUp}${ANSI.clearLine}`.repeat(drawn - 1)}`;
  };
  return {
    render: (lines: readonly string[]): void => {
      const columns = terminalWidth(stream) - 1;
      const fitted = lines.map((line) =>
        width(line) > columns ? truncate(stripAnsi(line), columns, { unicode }) : line
      );
      stream.write(`${drawn === 0 ? ANSI.hideCursor : ""}${erase()}${fitted.join("\n")}`);
      drawn = fitted.length;
    },
    clear: (): void => {
      if (drawn === 0) return;
      stream.write(`${erase()}${ANSI.showCursor}`);
      drawn = 0;
    }
  };
};

/**
 * Starts a live helper's lifetime: its timer (none without a `ticker`), and the end that stops it, erases `region`
 * and is also what Ctrl+C runs (through `target.onExit`).
 *
 * @param target - The run.
 * @param region - The helper's region, erased at the end.
 * @param ticker - What redraws and how often; none for a helper that redraws only when told.
 * @returns The run: whether it is running, the timer's stop, the end.
 */
export const startLiveRun = (
  target: LiveTarget,
  region: LiveRegion,
  ticker: LiveTicker | undefined
): LiveRun => {
  let isRunning = true;
  const interval = ticker ? setInterval(ticker.tick, ticker.everyMs) : undefined;
  const end = (): void => {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(interval);
    region.clear();
    removeCleanup();
  };
  const removeCleanup = target.onExit?.(end) ?? ((): void => undefined);
  return { isRunning: () => isRunning, stopTicker: () => clearInterval(interval), end };
};
