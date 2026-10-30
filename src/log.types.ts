/**
 * The types of the logger and of the look every helper renders with.
 *
 * @module
 */
import type { OutputStream } from "./io.types.ts";

/** How text is drawn: the settings every rendering helper takes. */
export interface OutputStyle {
  /** Whether colours are printed. */
  readonly color: boolean;
  /** Whether Unicode glyphs and box drawing are used (ASCII otherwise). */
  readonly unicode: boolean;
  /** Columns to lay text out in. */
  readonly width: number;
}

/** How a logger prints. */
export interface LoggerOptions {
  /** Print only warnings and errors. @defaultValue false */
  quiet?: boolean | undefined;
  /** Also print debug lines. @defaultValue false */
  verbose?: boolean | undefined;
  /** Send every line to stderr, keeping stdout for one JSON document (`--json`). @defaultValue false */
  json?: boolean | undefined;
  /** Colour on stdout. @defaultValue false */
  color?: boolean | undefined;
  /** Colour on stderr. @defaultValue the stdout setting */
  colorStderr?: boolean | undefined;
  /** Unicode glyphs. @defaultValue true */
  unicode?: boolean | undefined;
  /** Where results go. */
  stdout: OutputStream;
  /** Where warnings and errors go. */
  stderr: OutputStream;
}

/** The functions a script uses to print. */
export interface Logger {
  /** A neutral piece of information. */
  info: (message: string) => void;
  /** Something finished well. */
  success: (message: string) => void;
  /** Something the user should look at; the script goes on. */
  warn: (message: string) => void;
  /** Something failed. */
  error: (message: string) => void;
  /** Detail for whoever debugs the script; shown only with `verbose`. */
  debug: (message: string) => void;
  /** The script starts a step. */
  step: (message: string) => void;
  /** An indented, muted line on stderr under the previous warning or error: what to do about it. */
  hint: (message: string) => void;
  /** Text with no glyph (tables, boxes, raw output); respects `quiet`; several lines are fine. */
  plain: (message: string) => void;
  /** The look of stdout, for helpers that render text the logger then prints. */
  readonly style: OutputStyle;
  /** The look of stderr, where live output and prompts are drawn. */
  readonly errorStyle: OutputStyle;
  /** Whether `quiet` is on: live helpers then draw nothing and print only problems. */
  readonly isQuiet: boolean;
}
