/**
 * What the release reads from commit messages, checked before it does: each subject a conventional commit
 * (`type(scope)!: description`), since the next version and the changelog come from them.
 *
 * @remarks
 * The merge commits git and GitHub write (`Merge branch …`, `Merge pull request …`) are let through: they carry the
 * commits they bring, which are checked themselves. Pure.
 *
 * @module
 */

/** The commit types the repository uses; `feat` and `fix` make a release, the others go into the changelog only. */
export const COMMIT_TYPES = [
  "feat",
  "fix",
  "perf",
  "refactor",
  "docs",
  "chore",
  "test",
  "style",
  "build",
  "ci",
  "revert"
] as const;

/** The longest a subject may be. */
export const MAX_SUBJECT_LENGTH = 100;

/** A conventional subject: a known type, an optional scope, an optional `!`, a description. */
const CONVENTIONAL = new RegExp(`^(${COMMIT_TYPES.join("|")})(\\([a-z0-9][a-z0-9-]*\\))?!?: \\S`);

/** The merge commits git and GitHub write. */
const MERGE = /^Merge (branch|pull request|remote-tracking branch) /;

/**
 * Why a commit's subject cannot be read by the release, or nothing when it can.
 *
 * @param subject - The commit's first line.
 */
export const subjectProblem = (subject: string): string | undefined => {
  if (MERGE.test(subject)) return undefined;
  if (!CONVENTIONAL.test(subject)) {
    return `is not a conventional commit: <type>(<scope>)!: <description>, the type one of ${COMMIT_TYPES.join(", ")}`;
  }
  if (subject.length > MAX_SUBJECT_LENGTH) return `is longer than ${MAX_SUBJECT_LENGTH} characters`;
  return undefined;
};
