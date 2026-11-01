# `check-commits`

The release takes the next version and the changelog from the commit messages (`feat:` a feature, `fix:` a fix, `!` or
a `BREAKING CHANGE:` footer a break), so a message it cannot read would be a change missing from both. This command
checks every commit of a range is a conventional commit, a known type, an optional scope, a description, at most 100
characters; the merge commits git and GitHub write pass. The whole message, body included, may not point at notes
outside this repository (decision ids, numbered notes, the private repository; the patterns are in
`../check-internal-refs`), since the history is public and its readers cannot open them.

The CI runs it on every push (the commits the push brings) and pull request (the commits it adds to its base). Its
logic is `commitMessages.ts`, tested in `commitMessages.test.ts`.
