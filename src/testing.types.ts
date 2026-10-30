/**
 * The types of the test helpers: a captured `ScriptIo` and the result of running a script in a test.
 *
 * @module
 */
import type { ProgramRunner } from "./exec.types.ts";
import type { ExitSignal, ScriptIo } from "./io.types.ts";

/** How the fake terminal of a test behaves. */
export interface TestIoOptions {
  /** Answers the programs `exec()` runs, instead of starting them; none leaves them to the real runner. */
  exec?: ProgramRunner | undefined;
  /** Whether stdout, stderr and stdin claim to be a terminal. @defaultValue false */
  tty?: boolean | undefined;
  /** Terminal width. @defaultValue 80 */
  columns?: number | undefined;
  /** The environment; nothing from the real one leaks in. @defaultValue \{\} */
  env?: Readonly<Record<string, string | undefined>> | undefined;
  /** Text available on stdin (answers to prompts, piped input). */
  input?: string | undefined;
  /** The folder returned as `io.cwd`. @defaultValue "/" */
  cwd?: string | undefined;
  /** Command-line arguments returned as `io.argv`. @defaultValue [] */
  argv?: readonly string[] | undefined;
}

/** A captured `ScriptIo` and what was written to it. */
export interface TestIo {
  /** The io to pass to `run` or to a helper. */
  readonly io: ScriptIo;
  /** Everything written to stdout, escape codes included. */
  readonly stdout: () => string;
  /** Everything written to stderr, escape codes included. */
  readonly stderr: () => string;
  /** Both streams interleaved in write order, escape codes included. */
  readonly output: () => string;
  /** Writes more text to stdin (a key press or an answer typed later). */
  readonly type: (text: string) => void;
  /** Ends stdin, as when the user presses Ctrl+D or the pipe closes. */
  readonly endInput: () => void;
  /** Sends a signal, as Ctrl+C would. */
  readonly signal: (signal: ExitSignal) => void;
  /** The code passed to `io.exit`, when a signal ended the run. */
  readonly exitedWith: () => number | undefined;
  /** The code passed to `io.setExitCode`. */
  readonly exitCode: () => number | undefined;
}

/** What `runScript` returns. */
export interface ScriptRun {
  /** The exit code. */
  readonly exitCode: number;
  /** stdout with escape codes stripped. */
  readonly stdout: string;
  /** stderr with escape codes stripped. */
  readonly stderr: string;
  /** stdout as written. */
  readonly rawStdout: string;
  /** stderr as written. */
  readonly rawStderr: string;
}

/** What `runScriptProcess` returns. */
export interface ScriptProcessRun {
  /** The exit code; `null` when the process was killed by a signal. */
  readonly exitCode: number | null;
  /** Everything the process wrote to stdout. */
  readonly stdout: string;
  /** Everything the process wrote to stderr. */
  readonly stderr: string;
}
