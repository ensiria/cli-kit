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

/** How a column's cells sit in it. */
export type MarkdownAlign = "left" | "center" | "right";

/** A column of a table to format: the key of its cells in each row, its title, its alignment. */
export interface MarkdownColumn<TKey extends string> {
  /** The key of the column's cell in each row. */
  readonly key: TKey;
  /** The column's title, plain text. */
  readonly title: string;
  /** How its cells sit. @defaultValue "left" */
  readonly align?: MarkdownAlign | undefined;
}

/** Text that is Markdown already (a code span, a link): put in a table as it is, only its `|` escaped. */
export interface MarkdownText {
  /** The Markdown. */
  readonly markdown: string;
}

/** A cell: plain text (escaped), a number, or Markdown already written. */
export type MarkdownCell = string | number | MarkdownText;

/** How a table is laid out. */
export interface MarkdownTableOptions {
  /**
   * Whether every column is padded to its widest cell, for reading the file as text. Off, a table is compact
   * (`| a | b |`), so editing one cell changes one line in a diff.
   * @defaultValue false
   */
  readonly isPadded?: boolean | undefined;
}
