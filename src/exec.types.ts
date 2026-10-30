/**
 * The public types of `exec()`: how a program is run, what comes back, and the runner a test hands the io instead of
 * starting real programs.
 *
 * @module
 */
import type { ScriptIo } from "./io.types.ts";

/** Where a program's output goes. */
export type ExecOutput =
  /** Kept and returned, nothing printed. */
  | "capture"
  /** Printed as the program writes it (its own terminal when the script has one); nothing returned. */
  | "inherit"
  /** Each line printed on stderr after a label (`build │ …`), and kept and returned. */
  | "prefix";

/** How `exec()` runs a program. */
export interface ExecOptions {
  /** The folder it runs in. @defaultValue the io's `cwd` */
  readonly cwd?: string | undefined;
  /** Its environment, `PATH` included, where the program is looked for. @defaultValue the io's `env` */
  readonly env?: Readonly<Record<string, string | undefined>> | undefined;
  /** Text written to its stdin, which is then closed; none leaves stdin closed. */
  readonly input?: string | undefined;
  /** How long it may run, in ms: then it is stopped (SIGTERM, SIGKILL 2 s later) and `exec` fails. */
  readonly timeoutMs?: number | undefined;
  /** Where its output goes. @defaultValue `"capture"` */
  readonly output?: ExecOutput | undefined;
  /** The label of each line with `output: "prefix"`. @defaultValue the program's name */
  readonly prefix?: string | undefined;
  /**
   * Whether a non-zero exit fails `exec` with a `ScriptError` naming the program, its code and the end of its stderr;
   * `false` returns the result for the script to judge. A missing program and a timeout fail either way.
   * @defaultValue true
   */
  readonly check?: boolean | undefined;
  /** The io it prints through and whose runner starts it: the script's (`context.io`). @defaultValue the process's */
  readonly io?: ScriptIo | undefined;
}

/** What a program left when it ended. */
export interface ExecResult {
  /** What it printed on stdout (empty with `output: "inherit"`). */
  readonly stdout: string;
  /** What it printed on stderr (empty with `output: "inherit"`). */
  readonly stderr: string;
  /** Its exit code; `null` when a signal ended it. */
  readonly code: number | null;
  /** The signal that ended it, if one did. */
  readonly signal: NodeJS.Signals | null;
}

/** One program to run, as a runner receives it: the options resolved. */
export interface ProgramRequest {
  /** The program, looked for on `env.PATH`. */
  readonly program: string;
  /** Its arguments, never through a shell. */
  readonly args: readonly string[];
  /** The folder it runs in. */
  readonly cwd: string;
  /** Its environment. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Text for its stdin, if any. */
  readonly input: string | undefined;
  /** How long it may run, in ms, if limited. */
  readonly timeoutMs: number | undefined;
  /** Where its output goes. */
  readonly output: ExecOutput;
  /** The label of each line with `output: "prefix"`. */
  readonly prefix: string;
}

/** How a program's run ended, as a runner reports it. */
export type ProgramOutcome =
  /** It ran and ended, with this result. */
  | ({ readonly kind: "ended" } & ExecResult)
  /** It is not installed, or not on the `PATH`. */
  | { readonly kind: "missing" }
  /** It ran past its time and was stopped; what it printed until then. */
  | { readonly kind: "timeout"; readonly stdout: string; readonly stderr: string }
  /** It could not be started for another reason. */
  | { readonly kind: "failed"; readonly message: string };

/**
 * Starts a program and reports how it ended: the real one spawns it; a test's (`createTestIo({ exec })`) answers
 * without starting anything.
 */
export type ProgramRunner = (request: ProgramRequest, io: ScriptIo) => Promise<ProgramOutcome>;
