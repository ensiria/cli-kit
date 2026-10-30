/**
 * The types of the Markdown helpers.
 *
 * @module
 */

/** A table found in a Markdown text, by line. */
export interface MarkdownTable {
  /** The header's cells. */
  readonly header: readonly string[];
  /** Every body row's cells, in order. */
  readonly rows: readonly (readonly string[])[];
  /** Index (in the text's lines) of the first body row. */
  readonly firstRow: number;
  /** Index of the first line after the last body row. */
  readonly end: number;
}
