/**
 * Markdown read and written by scripts: table rows, a table found by its header, a section's body, and escaping.
 *
 * @remarks
 * For the generators and checks that keep a Markdown file in sync with data (`BUILD-ORDER.md`, `docs/scripts.md`,
 * `CATALOG.md`): they read a table, recompute it and write back only what they own, leaving the prose alone.
 * Lines are split on `\n`; a section runs from its heading to the next heading of the same level or higher.
 *
 * @module
 */
import type { MarkdownTable } from "./markdown.types.ts";

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
