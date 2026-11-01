# check-internal-refs

cli-kit was extracted from its author's private repository, where comments and tests could point at a private
decision index (`D-469`) or at numbered notes (`note 142`). Those references mean nothing to a reader of this public
repository, so none may reach it: a comment says the reason itself.

The command reads every file git tracks (not images, fonts, the lockfile, nor the rule's own files, which have to spell
out what they look for) and fails on a decision id, a numbered note
or the private repository's name, with the file and line of each. `pnpm checks` runs it, and so does the CI; the same
patterns are checked in commit messages by `check-commits`.

- `internalRefs.ts`: the patterns, pure.
- `internalRefs.test.ts`: what is found and what ordinary text is left alone.
