/**
 * Markdown read and written by scripts: a table formatted from data, table rows, a table found by its header, a
 * section's body, and escaping.
 *
 * @remarks
 * For the generators and checks that keep a Markdown file in sync with data (`BUILD-ORDER.md`, `docs/scripts.md`,
 * `CATALOG.md`): they read a table, recompute it and write back only what they own, leaving the prose alone.
 * Lines are split on `\n`; a section runs from its heading to the next heading of the same level or higher.
 *
 * @module
 */
import type {
  MarkdownAlign,
  MarkdownCell,
  MarkdownColumn,
  MarkdownTable,
  MarkdownTableOptions,
  MarkdownText
} from "./markdown.types.ts";
import { width } from "./text.ts";

/**
 * Escapes text for Markdown prose: `<` and `>` would be read as HTML.
 *
 * @param text - Plain text.
 * @returns The escaped text.
 */
export const escapeMarkdown = (text: string): string => text.replaceAll("<", "\\<").replaceAll(">", "\\>");

/**
 * Escapes text for a table cell: prose escaping plus `|`, which would end the cell.
 *
 * @param text - Plain text.
 * @returns The escaped cell.
 */
export const escapeTableCell = (text: string): string => escapeMarkdown(text).replaceAll("|", "\\|");

/**
 * The cells of a table line, trimmed; an escaped `\|` stays inside its cell.
 *
 * @param line - `| a | b |`.
 * @returns `["a", "b"]`.
 */
export const splitTableRow = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());

/**
 * A table line from its cells; an empty cell is written `| |`.
 *
 * @param cells - The cells, already escaped.
 * @returns `| a | b |`.
 */
export const formatTableRow = (cells: readonly string[]): string =>
  `|${cells.map((cell) => (cell === "" ? " " : ` ${cell} `)).join("|")}|`;

/** Whether a line is a table's header separator (`|---|:---:|`). */
const isSeparator = (line: string): boolean => /^\|?(\s*:?-{3,}:?\s*\|)+\s*:?-*:?\s*$/.test(line.trim());

/**
 * Finds the first table whose header matches.
 *
 * @param text - The Markdown.
 * @param isHeader - Tells the wanted table by its header cells.
 * @returns The table with its line positions, or undefined.
 * @example
 * ```ts
 * const table = findTable(text, (header) => header[0] === "#" && header[1] === "Wave");
 * ```
 */
export const findTable = (
  text: string,
  isHeader: (cells: readonly string[]) => boolean
): MarkdownTable | undefined => {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trimStart().startsWith("|") || !isSeparator(lines[index + 1] ?? "")) continue;
    const header = splitTableRow(line);
    if (!isHeader(header)) continue;
    const firstRow = index + 2;
    let end = firstRow;
    while (end < lines.length && (lines[end] ?? "").trimStart().startsWith("|")) end += 1;
    return { header, rows: lines.slice(firstRow, end).map(splitTableRow), firstRow, end };
  }
  return undefined;
};

/** Where a section's body starts and ends, or undefined when the heading is missing. */
const sectionBounds = (text: string, heading: string): { start: number; end: number } | undefined => {
  const isAtStart = text.startsWith(`${heading}\n`);
  const at = isAtStart ? 0 : text.indexOf(`\n${heading}\n`) + 1;
  if (!isAtStart && at === 0) return undefined;
  const start = at + heading.length + 1;
  const level = (heading.match(/^#+/)?.[0] ?? "##").length;
  const next = new RegExp(`\\n#{1,${level}} `, "g");
  next.lastIndex = start - 1;
  return { start, end: next.exec(text)?.index ?? text.length };
};

/**
 * The body of a section: from after its heading line to the next heading of the same level or higher.
 *
 * @param text - The Markdown.
 * @param heading - The heading line, exactly (`## Counts`).
 * @returns The body (it starts with the blank line under the heading, when there is one), or undefined.
 */
export const readSection = (text: string, heading: string): string | undefined => {
  const bounds = sectionBounds(text, heading);
  return bounds ? text.slice(bounds.start, bounds.end) : undefined;
};

/**
 * Replaces the body of a section, keeping its heading and everything around it.
 *
 * @param text - The Markdown.
 * @param heading - The heading line, exactly (`## Counts`).
 * @param body - The new body; a blank line is put under the heading.
 * @returns The new text.
 * @throws Error when the heading is missing.
 */
export const replaceSection = (text: string, heading: string, body: string): string => {
  const bounds = sectionBounds(text, heading);
  if (!bounds) throw new Error(`section "${heading}" not found`);
  return `${text.slice(0, bounds.start)}\n${body}${text.slice(bounds.end)}`;
};

/**
 * Markdown written already, for a table cell that must not be escaped (a link, emphasis).
 *
 * @param markdown - The Markdown.
 * @returns The cell.
 */
export const markdownText = (markdown: string): MarkdownText => ({ markdown });

/**
 * Text as inline code: between backticks, as many as it takes to hold the backticks inside it.
 *
 * @param text - The code (`--project <value>`).
 * @returns The code span, for a table cell; its `.markdown` for prose.
 */
export const codeSpan = (text: string): MarkdownText => {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  // a space keeps a backtick at either end from joining the fence
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return { markdown: `${fence}${padding}${text}${padding}${fence}` };
};

/** A cell as written in the table: plain text escaped, Markdown with only its `|` escaped. */
const cellText = (cell: MarkdownCell): string => {
  if (typeof cell === "number") return String(cell);
  if (typeof cell === "string") return escapeTableCell(cell);
  return cell.markdown.replace(/(?<!\\)\|/g, "\\|");
};

/**
 * A column's separator cell: dashes, with a colon at the end for a right column and at both ends for a centred one.
 *
 * @param align - The column's alignment.
 * @param length - The cell's length, colons included; three dashes at least.
 */
const separatorCell = (align: MarkdownAlign, length: number): string => {
  const colons = { left: 0, center: 2, right: 1 }[align];
  const dashes = "-".repeat(Math.max(3, length - colons));
  if (align === "center") return `:${dashes}:`;
  return align === "right" ? `${dashes}:` : dashes;
};

/** A cell padded to its column's width, as its alignment says. */
const paddedCell = (text: string, align: MarkdownAlign, columnWidth: number): string => {
  const space = Math.max(0, columnWidth - width(text));
  if (align === "right") return `${" ".repeat(space)}${text}`;
  if (align === "center")
    return `${" ".repeat(Math.floor(space / 2))}${text}${" ".repeat(Math.ceil(space / 2))}`;
  return `${text}${" ".repeat(space)}`;
};

/**
 * A Markdown table from data: the columns' titles, the separator with their alignments, then a line per row, every
 * cell escaped unless it is Markdown already (`codeSpan`, `markdownText`).
 *
 * @param columns - The columns, in order: each cell's key in the rows, the title, the alignment.
 * @param rows - The rows, each a cell per column's key.
 * @param options - Whether the columns are padded to their widest cell. @defaultValue compact
 * @returns The table's lines, joined by newlines, with no newline at the end.
 * @example
 * ```ts
 * formatTable(
 *   [{ key: "option", title: "Option" }, { key: "does", title: "What it does" }],
 *   [{ option: codeSpan("--json"), does: "Print the result as JSON." }]
 * );
 * // | Option | What it does |
 * // |---|---|
 * // | `--json` | Print the result as JSON. |
 * ```
 */
export const formatTable = <TKey extends string>(
  columns: readonly MarkdownColumn<TKey>[],
  rows: readonly Readonly<Record<TKey, MarkdownCell>>[],
  options: MarkdownTableOptions = {}
): string => {
  const titles = columns.map((column) => escapeTableCell(column.title));
  const body = rows.map((row) => columns.map((column) => cellText(row[column.key])));
  const aligns = columns.map((column) => column.align ?? "left");
  if (!options.isPadded) {
    const separator = `|${aligns.map((align) => separatorCell(align, 0)).join("|")}|`;
    return [formatTableRow(titles), separator, ...body.map(formatTableRow)].join("\n");
  }
  const widths = columns.map((_column, index) =>
    Math.max(3, ...[titles, ...body].map((cells) => width(cells[index] ?? "")))
  );
  const padded = (cells: readonly string[]): string =>
    formatTableRow(cells.map((cell, index) => paddedCell(cell, aligns[index] ?? "left", widths[index] ?? 3)));
  // the separator spans the cells' padding too, so its colons sit at the cell's edges
  const separator = `|${aligns.map((align, index) => separatorCell(align, (widths[index] ?? 3) + 2)).join("|")}|`;
  return [padded(titles), separator, ...body.map(padded)].join("\n");
};
