/**
 * The types of the layout helpers: tables, key–value lists, lists, trees, boxes and columns.
 *
 * @module
 */
import type { Tone } from "./style.types.ts";

/** How a table column is drawn. */
export interface TableColumn {
  /** The header text. */
  readonly header: string;
  /** Where cells sit. @defaultValue "left" */
  readonly align?: "left" | "right" | "center" | undefined;
  /** How a cell too wide is cut: at the end, or in the middle (paths, URLs). @defaultValue "end" */
  readonly truncate?: "end" | "middle" | undefined;
  /** The widest the column may be. */
  readonly maxWidth?: number | undefined;
  /** Tone of the cells (the header is always strong). */
  readonly tone?: Tone | undefined;
}

/** Options of `table`. */
export interface TableOptions {
  /** The columns, in order; a row's cells are matched by position. */
  readonly columns: readonly TableColumn[];
  /** Draw a box around the table and lines between columns. @defaultValue false */
  readonly border?: boolean | undefined;
  /** Hide the header row. @defaultValue false */
  readonly hideHeader?: boolean | undefined;
}

/** A cell value: text or a number (numbers are formatted with grouping and right-aligned by default). */
export type TableCell = string | number | null | undefined;

/** An item of `list`: text, or text with nested items. */
export type ListItem = string | { readonly text: string; readonly children: readonly ListItem[] };

/** Options of `list`. */
export interface ListOptions {
  /** Number the items instead of bullets. @defaultValue false */
  readonly ordered?: boolean | undefined;
}

/** A node of `tree`. */
export interface TreeNode {
  /** The node's text. */
  readonly label: string;
  /** Its children. */
  readonly children?: readonly TreeNode[] | undefined;
}

/** Options of `box`. */
export interface BoxOptions {
  /** Shown in the top border. */
  readonly title?: string | undefined;
  /** Tone of the border and the title. @defaultValue "muted" */
  readonly tone?: Tone | undefined;
  /** Spaces between the border and the text. @defaultValue 1 */
  readonly padding?: number | undefined;
}
