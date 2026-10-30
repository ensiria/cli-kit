/**
 * Text measured and shaped for a terminal: escape codes stripped, display width, padding, wrapping, truncation and
 * hyperlinks.
 *
 * @remarks
 * Widths are display columns, not string lengths: wide characters (CJK) and emoji take two columns, combining marks
 * and escape codes none. Measuring helpers ignore escape codes, so coloured text pads correctly; the shaping helpers
 * (`truncate`, `middleTruncate`, `wrap`) take plain text and are coloured afterwards.
 *
 * @module
 */
import { stripVTControlCharacters } from "node:util";

import { ENV, SYMBOLS } from "./constants.ts";
import { pick } from "./glyphs.ts";
import { isCi } from "./io.ts";
import type { OutputStream, ScriptIo } from "./io.types.ts";
import type { MiddleTruncateOptions, TruncateOptions } from "./text.types.ts";

/**
 * Removes colours and other terminal escape codes, for measuring text or asserting on it in tests.
 *
 * @param text - Text that may hold escape codes.
 * @returns The visible text.
 */
export const stripAnsi = (text: string): string => stripVTControlCharacters(text);

/** Splits text into user-perceived characters (an emoji with modifiers is one). */
const SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

/** Graphemes that take two columns: emoji shown as pictures, regional-indicator flags. */
const WIDE_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

/** Code points of East Asian wide and fullwidth blocks. */
const WIDE_RANGES: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xa000, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x20000, 0x3fffd]
];

/** Emoji that default to a narrow text presentation unless followed by U+FE0F. */
const TEXT_PRESENTATION = /^[©®‼⁉™ℹ↔-↪Ⓜ▪-➿⤴⤵]$/u;

/** The display width of one grapheme. */
const graphemeWidth = (grapheme: string): number => {
  const code = grapheme.codePointAt(0) ?? 0;
  if (code < 0x20 || (code >= 0x7f && code < 0xa0)) return 0;
  if (/^\p{Mark}+$/u.test(grapheme)) return 0;
  if (WIDE_EMOJI.test(grapheme)) {
    return TEXT_PRESENTATION.test(grapheme) ? 1 : 2;
  }
  return WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1;
};

/** The graphemes of a text. */
const graphemes = (text: string): string[] => Array.from(SEGMENTER.segment(text), (part) => part.segment);

/**
 * How many terminal columns a text takes.
 *
 * @param text - Any text; escape codes are ignored.
 * @returns The display width of its widest line.
 */
export const width = (text: string): number =>
  Math.max(
    0,
    ...stripAnsi(text)
      .split("\n")
      .map((line) => graphemes(line).reduce((total, grapheme) => total + graphemeWidth(grapheme), 0))
  );

/**
 * Pads text to a display width; escape codes do not count.
 *
 * @param text - The text (may be coloured).
 * @param columns - The width to reach.
 * @param align - Where the text sits. @defaultValue "left"
 * @returns The padded text (unchanged when already as wide).
 */
export const pad = (text: string, columns: number, align: "left" | "right" | "center" = "left"): string => {
  const missing = Math.max(0, columns - width(text));
  if (align === "right") return `${" ".repeat(missing)}${text}`;
  if (align === "center") {
    const left = Math.floor(missing / 2);
    return `${" ".repeat(left)}${text}${" ".repeat(missing - left)}`;
  }
  return `${text}${" ".repeat(missing)}`;
};

/** The longest run of graphemes, from the start or the end, that fits in a width. */
const takeColumns = (parts: readonly string[], columns: number, fromEnd: boolean): string => {
  const kept: string[] = [];
  let used = 0;
  const ordered = fromEnd ? [...parts].reverse() : parts;
  for (const part of ordered) {
    const partWidth = graphemeWidth(part);
    if (used + partWidth > columns) break;
    kept.push(part);
    used += partWidth;
  }
  return (fromEnd ? kept.reverse() : kept).join("");
};

/**
 * Cuts plain text at the end so it fits a width, with an ellipsis.
 *
 * @param text - Plain text (no escape codes).
 * @param columns - The width it must fit.
 * @param options - Ellipsis form.
 * @returns The text, unchanged when it fits.
 */
export const truncate = (text: string, columns: number, options: TruncateOptions = {}): string => {
  if (width(text) <= columns) return text;
  const ellipsis = pick(SYMBOLS.ellipsis, options.unicode ?? true);
  return `${takeColumns(graphemes(text), Math.max(0, columns - width(ellipsis)), false)}${ellipsis}`;
};

/**
 * Cuts plain text in the middle so it fits a width: the head shrinks, the tail stays (Kaji's `MiddleTruncate` rule),
 * so a path keeps its file name and a URL its last segment.
 *
 * @param text - Plain text (no escape codes).
 * @param columns - The width it must fit.
 * @param options - Tail length and ellipsis form.
 * @returns The text, unchanged when it fits.
 * @example
 * ```ts
 * middleTruncate("packages/design-system/tools/build-order.mts", 30); // "packages/desi…/build-order.mts"
 * ```
 */
export const middleTruncate = (
  text: string,
  columns: number,
  options: MiddleTruncateOptions = {}
): string => {
  if (width(text) <= columns) return text;
  const ellipsis = pick(SYMBOLS.ellipsis, options.unicode ?? true);
  const available = Math.max(0, columns - width(ellipsis));
  const slash = text.lastIndexOf("/");
  const segment = slash >= 0 ? width(text.slice(slash)) : 0;
  const defaultTail =
    segment > 0 && segment <= Math.floor((available * 2) / 3) ? segment : Math.ceil(available / 2);
  const tailColumns = Math.min(available, options.tail ?? defaultTail);
  const parts = graphemes(text);
  return `${takeColumns(parts, available - tailColumns, false)}${ellipsis}${takeColumns(parts, tailColumns, true)}`;
};

/** Breaks a word wider than the width into pieces that fit (at least one grapheme each). */
const breakWord = (word: string, columns: number): string[] => {
  const pieces: string[] = [];
  let rest = word;
  while (width(rest) > columns) {
    const head = takeColumns(graphemes(rest), columns, false) || (graphemes(rest)[0] ?? "");
    pieces.push(head);
    rest = rest.slice(head.length);
  }
  if (rest || pieces.length === 0) pieces.push(rest);
  return pieces;
};

/** Wraps one paragraph (no line breaks) at spaces. */
const wrapParagraph = (paragraph: string, columns: number): string[] => {
  const lines: string[] = [];
  let line = "";
  for (const piece of paragraph.split(/ +/).flatMap((word) => breakWord(word, columns))) {
    if (line && width(`${line} ${piece}`) <= columns) {
      line = `${line} ${piece}`;
      continue;
    }
    if (line) lines.push(line);
    line = piece;
  }
  lines.push(line);
  return lines;
};

/**
 * Wraps plain text to a width at spaces; words longer than the width are broken. Existing line breaks are kept.
 *
 * @param text - Plain text.
 * @param columns - The width of a line.
 * @returns The wrapped text.
 */
export const wrap = (text: string, columns: number): string =>
  text
    .split("\n")
    .flatMap((paragraph) => wrapParagraph(paragraph, columns))
    .join("\n");

/**
 * Indents every non-empty line.
 *
 * @param text - The text.
 * @param prefix - Spaces to add, or the prefix itself. @defaultValue 2
 * @returns The indented text.
 */
export const indent = (text: string, prefix: number | string = 2): string => {
  const head = typeof prefix === "number" ? " ".repeat(prefix) : prefix;
  return text
    .split("\n")
    .map((line) => (line.length > 0 ? `${head}${line}` : line))
    .join("\n");
};

/** Terminals known to show OSC 8 hyperlinks, by `TERM_PROGRAM`. */
const LINK_TERMINALS: readonly string[] = ["iTerm.app", "WezTerm", "vscode", "ghostty", "Hyper", "Tabby"];

/**
 * Whether a stream's terminal shows clickable hyperlinks (OSC 8). `FORCE_HYPERLINK=1` / `0` overrides.
 *
 * @param stream - Where the link goes.
 * @param env - The environment.
 * @returns True when {@link link} may write the escape sequence.
 */
export const supportsLinks = (stream: OutputStream, env: ScriptIo["env"]): boolean => {
  const forced = env[ENV.forceHyperlink];
  if (forced !== undefined && forced !== "") return forced !== "0";
  if (stream.isTTY !== true || isCi(env)) return false;
  const program = env[ENV.termProgram];
  if (program && LINK_TERMINALS.includes(program)) return true;
  return Number(env[ENV.vteVersion] ?? 0) >= 5000 || env[ENV.term] === "xterm-kitty";
};

/**
 * A hyperlink: clickable text where the terminal supports it, else the text followed by the URL.
 *
 * @param text - What is shown.
 * @param url - Where it points.
 * @param enabled - Whether the terminal supports links (see {@link supportsLinks}).
 * @returns The link.
 */
export const link = (text: string, url: string, enabled: boolean): string => {
  if (enabled) return `\u001B]8;;${url}\u0007${text}\u001B]8;;\u0007`;
  return text === url ? url : `${text} (${url})`;
};
