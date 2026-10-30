/**
 * The types of the text helpers' options.
 *
 * @module
 */

/** Options of the truncating helpers. */
export interface TruncateOptions {
  /** Whether to use `…` (Unicode) or `...` (ASCII). @defaultValue true */
  unicode?: boolean | undefined;
}

/** Options of `middleTruncate`. */
export interface MiddleTruncateOptions extends TruncateOptions {
  /** Columns kept at the end; by default the last path segment when it fits in two thirds, else half. */
  tail?: number | undefined;
}
