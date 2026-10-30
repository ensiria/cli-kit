# `doctor`

A doctor command: checks the tools a JavaScript project needs (Node, git, pnpm) and the project in the working folder
(its `package.json`, its lockfile, its git working tree), then prints a report whose exit code fails only when a check
failed.

What it shows:

- `checkProgram`: a program's version against a minimum, `fail` (or `warn` for an optional one) with what to do;
- `runChecks`: the checks run by section, a live list on a terminal and nothing in a pipe; a check that throws is a
  failed check, the others still run;
- `reportChecks`: the report, or its JSON with `--json`, and the exit code.

The checks are in `doctor.ts`, tested in `doctor.test.ts` with a test's runner (no program is started);
`doctor.mts` is the command, a handful of lines.
