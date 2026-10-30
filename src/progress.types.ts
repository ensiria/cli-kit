/**
 * The types of the progress bar.
 *
 * @module
 */

/** Options of `progress`. */
export interface ProgressOptions {
  /** What is being counted (`Optimising icons`). */
  readonly label: string;
  /** How many units in all; without it the bar is indeterminate (it moves, with no count or estimate). */
  readonly total?: number | undefined;
  /** The noun after the count (`files`). @defaultValue none */
  readonly unit?: string | undefined;
}

/** A running progress bar; end it with `done` or `fail`. */
export interface Progress {
  /** Adds to the count. @defaultValue 1 */
  readonly tick: (amount?: number) => void;
  /** Sets the count. */
  readonly set: (value: number) => void;
  /** Sets or changes the total (an indeterminate bar becomes determinate). */
  readonly setTotal: (total: number) => void;
  /** Changes the label. */
  readonly update: (label: string) => void;
  /** Ends with a success line (by default the label, the count and the time). */
  readonly done: (text?: string) => void;
  /** Ends with an error line. */
  readonly fail: (text?: string) => void;
}
