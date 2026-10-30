/**
 * The type of a timer.
 *
 * @module
 */

/** Measures the time since it started. */
export interface Timer {
  /** Milliseconds since the start. */
  readonly elapsed: () => number;
  /** The elapsed time as people read it (`1.2 s`, `3 min 4 s`). */
  readonly format: () => string;
  /** Starts again from now. */
  readonly reset: () => void;
}
