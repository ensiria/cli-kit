/**
 * The lines a script prints: one function per kind of message, each with its glyph and tone, so every tool reports
 * progress, results and problems the same way.
 *
 * @remarks
 * Results and steps go to stdout; warnings and errors go to stderr. `quiet` keeps only warnings and errors;
 * `verbose` adds the debug lines; `json` moves every line to stderr so stdout carries only the JSON result.
 *
 * @module
 */
import { glyph } from "./glyphs.ts";
import type { GlyphName } from "./glyphs.types.ts";
import { terminalWidth } from "./io.ts";
import type { OutputStream } from "./io.types.ts";
import type { Logger, LoggerOptions } from "./log.types.ts";
import { paint } from "./style.ts";
import type { Tone } from "./style.types.ts";

/** The kinds of line that carry a glyph. */
type LineKind = "info" | "success" | "warn" | "error" | "debug" | "step";

/** The look of each kind of line. */
const LINES: Readonly<Record<LineKind, { glyph: GlyphName; tone: Tone }>> = {
  info: { glyph: "info", tone: "accent" },
  success: { glyph: "success", tone: "success" },
  warn: { glyph: "warning", tone: "warning" },
  error: { glyph: "error", tone: "danger" },
  debug: { glyph: "debug", tone: "muted" },
  step: { glyph: "step", tone: "accent" }
};

/**
 * Creates the logger a script prints through. `defineScript` makes one from the common options; tests and helpers
 * can make their own.
 *
 * @param options - Streams, quiet / verbose / json, colour and glyphs.
 * @returns The logger.
 * @example
 * ```ts
 * const log = createLogger({ stdout: process.stdout, stderr: process.stderr, color: true });
 * log.step("Reading BUILD-ORDER.md");
 * log.success("305 rows, 13 waves");
 * ```
 */
export const createLogger = (options: LoggerOptions): Logger => {
  const unicode = options.unicode ?? true;
  const results = options.json ? options.stderr : options.stdout;
  const colorOut = options.color ?? false;
  const colorErr = options.colorStderr ?? colorOut;
  const colorOf = (stream: OutputStream): boolean => (stream === options.stderr ? colorErr : colorOut);
  const write = (kind: LineKind, stream: OutputStream, message: string): void => {
    const look = LINES[kind];
    stream.write(`${paint(look.tone, glyph(look.glyph, unicode), colorOf(stream))} ${message}\n`);
  };
  const toResults =
    (kind: LineKind): ((message: string) => void) =>
    (message: string): void => {
      if (!options.quiet) write(kind, results, message);
    };
  return {
    info: toResults("info"),
    success: toResults("success"),
    step: toResults("step"),
    warn: (message: string): void => write("warn", options.stderr, message),
    error: (message: string): void => write("error", options.stderr, message),
    debug: (message: string): void => {
      if (options.verbose && !options.quiet)
        write("debug", results, paint("muted", message, colorOf(results)));
    },
    hint: (message: string): void => {
      options.stderr.write(`  ${paint("muted", message, colorErr)}\n`);
    },
    plain: (message: string): void => {
      if (!options.quiet) results.write(`${message}\n`);
    },
    style: { color: colorOut, unicode, width: terminalWidth(options.stdout) },
    errorStyle: { color: colorErr, unicode, width: terminalWidth(options.stderr) },
    isQuiet: options.quiet ?? false
  };
};
