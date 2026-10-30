/**
 * The type of a spinner.
 *
 * @module
 */

/** A running spinner; end it with one of `succeed`, `fail`, `warn` or `stop`. */
export interface Spinner {
  /** Changes the text while it spins. */
  readonly update: (text: string) => void;
  /** Ends with a success line (the current text when none is given). */
  readonly succeed: (text?: string) => void;
  /** Ends with an error line. */
  readonly fail: (text?: string) => void;
  /** Ends with a warning line. */
  readonly warn: (text?: string) => void;
  /** Ends without a line. */
  readonly stop: () => void;
}
