/**
 * Structured output: tables, key–value lists, bullet and numbered lists, trees, titled boxes and columns.
 *
 * @remarks
 * Every helper returns a string (no trailing newline) that the script prints with `log.plain`, and takes the run's
 * {@link OutputStyle} so it follows `--no-color`, ASCII mode and the terminal's width. Text is measured in display
 * columns, so coloured cells, CJK and emoji line up.
 *
 * @module
 */
import { SYMBOLS } from "./constants.ts";
import { formatCount } from "./format.ts";
import { glyph, pick } from "./glyphs.ts";
import type {
  BoxOptions,
  ListItem,
  ListOptions,
  TableCell,
  TableColumn,
  TableOptions,
  TreeNode
} from "./layout.types.ts";
import type { OutputStyle } from "./log.types.ts";
import { paint } from "./style.ts";
import { middleTruncate, pad, stripAnsi, truncate, width } from "./text.ts";

/** Columns never shrink below this when a table is fitted to the terminal. */
const MIN_COLUMN_WIDTH = 4;

/** A cell as text. */
const cellText = (cell: TableCell): string => {
  if (cell === null || cell === undefined) return "";
  return typeof cell === "number" ? formatCount(cell) : cell;
};

/** Widths of the columns, shrunk (widest first) until the table fits `available` columns. */
const fitColumns = (
  natural: readonly number[],
  columns: readonly TableColumn[],
  available: number
): number[] => {
  const widths = natural.map((value, index) => Math.min(value, columns[index]?.maxWidth ?? value));
  let total = widths.reduce((sum, value) => sum + value, 0);
  while (total > available) {
    const widest = widths.indexOf(Math.max(...widths));
    const current = widths[widest] ?? 0;
    if (current <= MIN_COLUMN_WIDTH) break;
    widths[widest] = current - 1;
    total -= 1;
  }
  return widths;
};

/** Cuts a plain cell to its column, at the end or in the middle. */
const fitCell = (
  text: string,
  columnWidth: number,
  column: TableColumn | undefined,
  unicode: boolean
): string =>
  column?.truncate === "middle"
    ? middleTruncate(text, columnWidth, { unicode })
    : truncate(text, columnWidth, { unicode });

/**
 * A table: a header row, aligned columns, cells cut to fit the terminal.
 *
 * @param rows - The rows; each cell is text or a number (numbers right-aligned unless the column says otherwise).
 * @param options - The columns and whether to draw borders.
 * @param style - Colour, Unicode and width.
 * @returns The table.
 * @example
 * ```ts
 * log.plain(table([["build-order", 305]], { columns: [{ header: "Script" }, { header: "Rows" }] }, log.style));
 * ```
 */
export const table = (
  rows: readonly (readonly TableCell[])[],
  options: TableOptions,
  style: OutputStyle
): string => {
  const { columns } = options;
  const isBordered = options.border ?? false;
  const ruleChar = pick(SYMBOLS.rule, style.unicode);
  const box = pick(SYMBOLS.box, style.unicode);
  const texts = rows.map((row) => columns.map((_, index) => cellText(row[index])));
  const natural = columns.map((column, index) =>
    Math.max(options.hideHeader ? 0 : width(column.header), ...texts.map((row) => width(row[index] ?? "")))
  );
  const gaps = isBordered ? columns.length * 3 + 1 : (columns.length - 1) * 2;
  const widths = fitColumns(natural, columns, style.width - gaps);
  const alignOf = (index: number): "left" | "right" | "center" =>
    columns[index]?.align ?? (rows.some((row) => typeof row[index] === "number") ? "right" : "left");
  const line = (cells: readonly string[]): string => {
    const padded = cells.map((cell, index) => pad(cell, widths[index] ?? 0, alignOf(index)));
    if (!isBordered) return padded.join("  ").trimEnd();
    const side = paint("muted", box.vertical, style.color);
    return `${side} ${padded.join(` ${side} `)} ${side}`;
  };
  const rule = (left: string, middle: string, right: string): string =>
    paint(
      "muted",
      `${left}${widths.map((w) => box.horizontal.repeat(w + 2)).join(middle)}${right}`,
      style.color
    );
  const output: string[] = [];
  if (isBordered) output.push(rule(box.topLeft, box.teeDown, box.topRight));
  if (!options.hideHeader) {
    output.push(
      line(
        columns.map((column, index) =>
          paint("strong", fitCell(column.header, widths[index] ?? 0, column, style.unicode), style.color)
        )
      )
    );
    output.push(
      isBordered
        ? rule(box.teeRight, box.cross, box.teeLeft)
        : paint("muted", widths.map((w) => ruleChar.repeat(w)).join("  "), style.color)
    );
  }
  for (const row of texts) {
    output.push(
      line(
        row.map((text, index) => {
          const column = columns[index];
          const fitted = fitCell(text, widths[index] ?? 0, column, style.unicode);
          return column?.tone ? paint(column.tone, fitted, style.color) : fitted;
        })
      )
    );
  }
  if (isBordered) output.push(rule(box.bottomLeft, box.teeUp, box.bottomRight));
  return output.join("\n");
};

/**
 * Labels and values in two aligned columns, the labels muted: a summary of facts.
 *
 * @param entries - Label–value pairs, in order (an object's entries work too).
 * @param style - Colour, Unicode and width.
 * @returns The lines.
 * @example
 * ```ts
 * log.plain(keyValue([["Rows", "305"], ["Waves", "13"]], log.style));
 * ```
 */
export const keyValue = (entries: readonly (readonly [string, TableCell])[], style: OutputStyle): string => {
  const labelWidth = Math.max(0, ...entries.map(([label]) => width(label)));
  return entries
    .map(([label, value]) => {
      const text = cellText(value);
      const fitted = truncate(text, Math.max(MIN_COLUMN_WIDTH, style.width - labelWidth - 2), style);
      return `${paint("muted", pad(label, labelWidth), style.color)}  ${fitted}`;
    })
    .join("\n");
};

/**
 * A bullet or numbered list; items may nest.
 *
 * @param items - The items.
 * @param style - Colour, Unicode and width.
 * @param options - Numbered instead of bullets.
 * @returns The lines.
 */
export const list = (items: readonly ListItem[], style: OutputStyle, options: ListOptions = {}): string => {
  const render = (entries: readonly ListItem[], depth: number): string[] =>
    entries.flatMap((item, index) => {
      const text = typeof item === "string" ? item : item.text;
      const marker = options.ordered ? `${index + 1}.` : glyph("bullet", style.unicode);
      const head = `${"  ".repeat(depth)}${paint("muted", marker, style.color)} ${text}`;
      return typeof item === "string" ? [head] : [head, ...render(item.children, depth + 1)];
    });
  return render(items, 0).join("\n");
};

/**
 * A tree with branch lines, like `tree` prints folders.
 *
 * @param root - The root node; its label is the first line.
 * @param style - Colour and Unicode.
 * @returns The lines.
 */
export const tree = (root: TreeNode, style: OutputStyle): string => {
  const chars = pick(SYMBOLS.tree, style.unicode);
  const render = (nodes: readonly TreeNode[], prefix: string): string[] =>
    nodes.flatMap((node, index) => {
      const isLast = index === nodes.length - 1;
      const branch = paint("muted", `${prefix}${isLast ? chars.last : chars.branch}`, style.color);
      return [
        `${branch}${node.label}`,
        ...render(node.children ?? [], `${prefix}${isLast ? chars.space : chars.pipe}`)
      ];
    });
  return [root.label, ...render(root.children ?? [], "")].join("\n");
};

/**
 * A titled panel around some text, for summaries and next steps.
 *
 * @param content - The text inside; several lines are fine, long ones are cut to the terminal.
 * @param style - Colour, Unicode and width.
 * @param options - Title, border tone and padding.
 * @returns The box.
 * @example
 * ```ts
 * log.plain(box("3 files changed\nRun pnpm test", log.style, { title: "Done", tone: "success" }));
 * ```
 */
export const box = (content: string, style: OutputStyle, options: BoxOptions = {}): string => {
  const chars = pick(SYMBOLS.box, style.unicode);
  const padding = options.padding ?? 1;
  const tone = options.tone ?? "muted";
  const inner = Math.max(MIN_COLUMN_WIDTH, style.width - 2 - padding * 2);
  const lines = content
    .split("\n")
    .map((line) => (width(line) > inner ? truncate(stripAnsi(line), inner, style) : line));
  const title = options.title ? ` ${truncate(options.title, inner - 2, style)} ` : "";
  const contentWidth = Math.max(width(title), ...lines.map((line) => width(line)));
  const span = contentWidth + padding * 2;
  const border = (text: string): string => paint(tone, text, style.color);
  const fill = chars.horizontal.repeat(Math.max(0, span - width(title) - 1));
  const top = title
    ? `${border(chars.topLeft + chars.horizontal)}${paint("strong", title, style.color)}${border(fill + chars.topRight)}`
    : border(`${chars.topLeft}${chars.horizontal.repeat(span)}${chars.topRight}`);
  const space = " ".repeat(padding);
  return [
    top,
    ...lines.map(
      (line) => `${border(chars.vertical)}${space}${pad(line, contentWidth)}${space}${border(chars.vertical)}`
    ),
    border(`${chars.bottomLeft}${chars.horizontal.repeat(span)}${chars.bottomRight}`)
  ].join("\n");
};

/**
 * Short items in as many columns as the terminal fits, filled top to bottom, like `ls`.
 *
 * @param items - The items.
 * @param style - The width.
 * @returns The lines.
 */
export const columns = (items: readonly string[], style: OutputStyle): string => {
  if (items.length === 0) return "";
  const cellWidth = Math.max(...items.map((item) => width(item))) + 2;
  const perRow = Math.max(1, Math.floor((style.width + 2) / cellWidth));
  const rowCount = Math.ceil(items.length / perRow);
  const lines: string[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const cells: string[] = [];
    for (let column = 0; column * rowCount + row < items.length; column += 1) {
      cells.push(pad(items[column * rowCount + row] ?? "", cellWidth));
    }
    lines.push(cells.join("").trimEnd());
  }
  return lines.join("\n");
};
