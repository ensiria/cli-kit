/**
 * The types of the streams and process hooks a script talks to through {@link ScriptIo}.
 *
 * @module
 */
import type { ProgramRunner } from "./exec.types.ts";

/** A stream the kit writes to and asks whether it is a terminal. */
export interface OutputStream {
  /** Writes text. */
  write: (text: string) => unknown;
  /** True when the stream is an interactive terminal. */
  isTTY?: boolean | undefined;
  /** The terminal's width in columns, when known. */
  columns?: number | undefined;
}

/** A stream the kit reads from (prompts). */
export interface InputStream extends NodeJS.ReadableStream {
  /** True when the stream is an interactive terminal. */
  isTTY?: boolean | undefined;
  /** Switches a terminal to raw mode (key by key), when the stream is one. */
  setRawMode?: ((mode: boolean) => unknown) | undefined;
}

/** A signal the kit handles: Ctrl+C or a polite termination. */
export type ExitSignal = "SIGINT" | "SIGTERM";

/** Where signals come from: `process` in a real run, an emitter in tests. */
export interface SignalSource {
  /** Starts listening for a signal. */
  on: (signal: ExitSignal, listener: () => void) => unknown;
  /** Stops listening. */
  off: (signal: ExitSignal, listener: () => void) => unknown;
}

/**
 * Everything a script touches outside its own logic: the three streams, the environment, signals and the exit.
 *
 * @remarks
 * Scripts and the kit's helpers never reach for `process` directly: they get a `ScriptIo`, which is
 * {@link processIo} in a real run and {@link createTestIo} in a test, so every behaviour (terminal or pipe, colour,
 * width, Ctrl+C) can be tested without a real terminal.
 */
export interface ScriptIo {
  /** The folder the command was run from. */
  cwd: string;
  /** The command-line arguments after the script's path. */
  argv: readonly string[];
  /** Results. */
  stdout: OutputStream;
  /** Warnings, errors, and every log line in `--json` mode. */
  stderr: OutputStream;
  /** Answers to prompts. */
  stdin: InputStream;
  /** The environment (`NO_COLOR`, `CI`, option fallbacks). */
  env: Readonly<Record<string, string | undefined>>;
  /** Ctrl+C and SIGTERM. */
  signals: SignalSource;
  /** Sets the code the process ends with once the script returns. */
  setExitCode: (code: number) => void;
  /** Ends the process at once, after a signal has run the cleanups. */
  exit: (code: number) => void;
  /**
   * Starts the programs `exec()` runs; none spawns them. A test's io (`createTestIo({ exec })`) answers here without
   * starting real programs.
   */
  runProgram?: ProgramRunner | undefined;
}
