/**
 * The types of the `release-notes` example.
 *
 * @module
 */

/** A commit as `git log` gives it. */
export interface LoggedCommit {
  /** Its hash. */
  readonly hash: string;
  /** Its first line. */
  readonly subject: string;
  /** The rest of its message. */
  readonly body: string;
}

/** What the notes group commits by. */
export type ChangeKind = "breaking" | "feature" | "fix" | "other";

/** A commit read as a conventional commit (`feat(cli): add --json`). */
export interface Change {
  /** Its short hash. */
  readonly hash: string;
  /** Where it goes in the notes. */
  readonly kind: ChangeKind;
  /** Its type (`feat`, `fix`, `docs`); empty for a message that is not a conventional commit. */
  readonly type: string;
  /** Its scope (`cli`), if any. */
  readonly scope: string | undefined;
  /** What it does: the subject after the type. */
  readonly description: string;
}
