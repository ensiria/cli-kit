/**
 * The public types of `checks()`: a doctor command's report, named checks grouped in sections.
 *
 * @module
 */

/** How a check came out: fine, worth a look, broken, or not run. */
export type CheckStatus = "ok" | "warn" | "fail" | "skip";

/** What the user can do about a check that is not fine: a sentence, or a command to run. */
export type CheckFix =
  | {
      /** What to do, one sentence. */
      readonly hint: string;
    }
  | {
      /** The command that fixes it, to copy and run. */
      readonly command: string;
    };

/** One check of the report. */
export interface Check {
  /** What is checked (`tmux`, `the Keychain`). */
  readonly name: string;
  /** How it came out. */
  readonly status: CheckStatus;
  /** What was found, one line (`3.5a`, `not on the PATH`). */
  readonly detail: string;
  /** What to do about it, when there is something to do. */
  readonly fix?: CheckFix | undefined;
}

/** A group of checks under a title (`Tools`, `Settings`). */
export interface CheckSection {
  /** The section's title. */
  readonly title: string;
  /** Its checks, in order. */
  readonly checks: readonly Check[];
}

/** One check as the `--json` report lists it, with its section. */
export interface CheckRecord {
  /** The section's title. */
  readonly section: string;
  /** What is checked. */
  readonly name: string;
  /** How it came out. */
  readonly status: CheckStatus;
  /** What was found. */
  readonly detail: string;
  /** What to do about it, or `null`. */
  readonly fix: CheckFix | null;
}

/** How many checks came out each way. */
export type CheckCounts = Readonly<Record<CheckStatus, number>>;

/** How `checkProgram` checks a program. */
export interface ProgramCheckOptions {
  /** The program, looked for on the `PATH`. */
  readonly program: string;
  /** What the report calls it. @defaultValue the program */
  readonly name?: string | undefined;
  /** The arguments that print its version. @defaultValue `["--version"]` */
  readonly args?: readonly string[] | undefined;
  /** The oldest version that works (`2.39`); none takes any. */
  readonly minimum?: string | undefined;
  /** Whether a missing or older program is a failure; `false` makes it a warning. @defaultValue true */
  readonly isRequired?: boolean | undefined;
  /** What to do when it is missing or older. */
  readonly fix?: CheckFix | undefined;
}

/** A check to run: its name, shown while it runs, and the work that finds out how it comes out. */
export interface CheckToRun {
  /** What is checked; also the name of the check it returns when it throws. */
  readonly name: string;
  /** Finds out: returns the check (`checkProgram` returns one). */
  readonly run: () => Check | Promise<Check>;
}

/** A section of checks to run (`Tools`, `Settings`). */
export interface CheckGroup {
  /** The section's title. */
  readonly title: string;
  /** Its checks, run in order. */
  readonly checks: readonly CheckToRun[];
}
