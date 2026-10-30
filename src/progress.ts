/**
 * The progress bar: how far, how fast and how long to go, for work counted in units (files, rows, requests).
 *
 * @remarks
 * On an interactive terminal it redraws on stderr at most every `DURATION.progressRefresh` ms:
 * `label ████░░░░ 45/100 45% · 12/s · 4 s left`. Without a total it is indeterminate (a block moving back and forth).
 * In a pipe or CI it prints a plain line at most every `DURATION.plainProgressInterval` ms, then the final line.
 *
 * @module
 */
import { DURATION, SYMBOLS } from "./constants.ts";
import { formatCount, formatDuration } from "./format.ts";
import { pick } from "./glyphs.ts";
import { canAnimate, createLiveRegion, startLiveRun } from "./live.ts";
import type { LiveTarget } from "./live.types.ts";
import type { Progress, ProgressOptions } from "./progress.types.ts";
import { paint } from "./style.ts";
import { timer } from "./timer.ts";

/** Cells of the bar. */
const BAR_WIDTH = 24;

/** Cells of the moving block of an indeterminate bar. */
const BLOCK_WIDTH = 6;

/** How much of the total is done, 1 for an empty total. */
const fractionOf = (value: number, total: number): number => (total > 0 ? value / total : 1);

/**
 * The bar's cells.
 *
 * @param fraction - How much is done (0–1), or undefined for an indeterminate bar.
 * @param step - The animation step of an indeterminate bar (the block moves back and forth).
 * @param unicode - Block characters or ASCII.
 * @returns The bar, `BAR_WIDTH` cells wide.
 */
export const progressBar = (fraction: number | undefined, step: number, unicode: boolean): string => {
  const cells = pick(SYMBOLS.bar, unicode);
  if (fraction === undefined) {
    const span = BAR_WIDTH - BLOCK_WIDTH;
    const position = span - Math.abs((step % (span * 2)) - span);
    return `${cells.empty.repeat(position)}${cells.filled.repeat(BLOCK_WIDTH)}${cells.empty.repeat(span - position)}`;
  }
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * BAR_WIDTH);
  return `${cells.filled.repeat(filled)}${cells.empty.repeat(BAR_WIDTH - filled)}`;
};

/**
 * Starts a progress bar.
 *
 * @param options - Label, total and unit.
 * @param target - The run (`io`, `log`, `onExit`): a script passes its context.
 * @returns The bar.
 * @example
 * ```ts
 * const bar = progress({ label: "Optimising icons", total: files.length, unit: "files" }, context);
 * for (const file of files) { await optimise(file); bar.tick(); }
 * bar.done();
 * ```
 */
export const progress = (options: ProgressOptions, target: LiveTarget): Progress => {
  const { log } = target;
  const isLive = canAnimate(target);
  const region = createLiveRegion(target.io.stderr, log.style.unicode);
  const clock = timer();
  const unit = options.unit ? ` ${options.unit}` : "";
  let label = options.label;
  let total = options.total;
  let value = 0;
  let step = 0;
  let lastDraw = Number.NEGATIVE_INFINITY;

  const counts = (): string => {
    if (total === undefined) return `${formatCount(value)}${unit}`;
    const percent = total > 0 ? Math.floor((value / total) * 100) : 100;
    return `${formatCount(value)}/${formatCount(total)}${unit} ${percent}%`;
  };
  const rateAndEta = (): string => {
    const seconds = clock.elapsed() / 1000;
    if (seconds < 1 || value === 0) return "";
    const rate = value / seconds;
    const eta =
      total !== undefined && rate > 0 ? ` · ${formatDuration(((total - value) / rate) * 1000)} left` : "";
    return ` · ${formatCount(Math.round(rate))}/s${eta}`;
  };
  const line = (): string => {
    const color = log.errorStyle.color;
    const fraction = total === undefined ? undefined : fractionOf(value, total);
    const bar = paint("accent", progressBar(fraction, step, log.style.unicode), color);
    return `${label} ${bar} ${counts()}${paint("muted", rateAndEta(), color)}`;
  };
  const draw = (force: boolean): void => {
    if (!run.isRunning()) return;
    const now = Date.now();
    if (isLive) {
      if (force || now - lastDraw >= DURATION.progressRefresh) {
        region.render([line()]);
        lastDraw = now;
      }
      return;
    }
    if (!log.isQuiet && now - lastDraw >= DURATION.plainProgressInterval) {
      log.info(`${label} ${counts()}`);
      lastDraw = now;
    }
  };
  const nextStep = (): void => {
    step += 1;
    draw(true);
  };
  const run = startLiveRun(
    target,
    region,
    isLive && total === undefined ? { tick: nextStep, everyMs: DURATION.liveRefresh } : undefined
  );
  draw(true);

  const finish =
    (print: (message: string) => void, isSuccess: boolean): ((text?: string) => void) =>
    (text?: string): void => {
      if (!run.isRunning()) return;
      run.end();
      print(text ?? `${label}${isSuccess ? `: ${formatCount(value)}${unit} in ${clock.format()}` : ""}`);
    };
  return {
    tick: (amount = 1): void => {
      value += amount;
      draw(false);
    },
    set: (next: number): void => {
      value = next;
      draw(false);
    },
    setTotal: (next: number): void => {
      total = next;
      run.stopTicker();
      draw(true);
    },
    update: (next: string): void => {
      label = next;
      draw(true);
    },
    done: finish(log.success, true),
    fail: finish(log.error, false)
  };
};
