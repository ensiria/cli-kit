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
