/**
 * The types shared by the live helpers (spinner, progress, tasks, prompts).
 *
 * @module
 */
import type { Cleanup } from "./exit.types.ts";
import type { ScriptIo } from "./io.types.ts";
import type { Logger } from "./log.types.ts";

/**
 * What a live helper needs from the run. A script passes its `run` context, which has all of it.
 *
 * @example
 * ```ts
 * run: async (context) => { const spin = spinner("Building", context); … }
 * ```
 */
export interface LiveTarget {
  /** Where frames are drawn (stderr) and the environment that says whether to animate. */
  readonly io: ScriptIo;
  /** Prints the final lines, and tells whether `--quiet` is on. */
  readonly log: Logger;
  /** Registers the cleanup that clears the frame and shows the cursor on Ctrl+C. */
  readonly onExit?: ((cleanup: Cleanup) => () => void) | undefined;
}

/** The timer of a live helper: what redraws, and how often (ms). */
export interface LiveTicker {
  /** Called on every tick (the next frame). */
  readonly tick: () => void;
  /** Milliseconds between ticks. */
  readonly everyMs: number;
}

/** A live helper's lifetime, from {@link startLiveRun}. */
export interface LiveRun {
  /** Whether it has not ended yet. */
  readonly isRunning: () => boolean;
  /** Stops the timer, leaving the region and the run as they are (a progress that learns its total). */
  readonly stopTicker: () => void;
  /** Ends it once: stops the timer, erases the region, drops the Ctrl+C cleanup; later calls do nothing. */
  readonly end: () => void;
}

/** A block of lines redrawn in place on a terminal. */
export interface LiveRegion {
  /** Replaces what was drawn with these lines (cut to the terminal's width so nothing wraps). */
  readonly render: (lines: readonly string[]) => void;
  /** Erases what was drawn and shows the cursor again; the region can draw again afterwards. */
  readonly clear: () => void;
}
