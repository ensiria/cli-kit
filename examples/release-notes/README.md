# `release-notes`

The notes of a release from its conventional commits (`feat`, `fix`, `!` or a `BREAKING CHANGE:` footer): printed, or
kept in a changelog's section, which `--check` verifies in CI.

What it shows:

- `exec`: git run with its arguments as an array, a failure read the same as any other script's;
- `writeGenerated`: the changelog written only when it changed, or checked without writing (`--check`), the failure
  naming the command that brings it up to date;
- `formatTable` and `codeSpan`: the notes' summary table and the commits' hashes;
- `--json`: the changes as data.

The logic (git's output read, commits classified, the notes and the changelog's section) is in `releaseNotes.ts`, pure
and tested in `releaseNotes.test.ts`; `release-notes.mts` is the command.
