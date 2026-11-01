# Instructions for agents working on cli-kit

cli-kit (`@ensiria/cli-kit`) is a set of helpers for Node scripts and command-line tools: one definition gives the
parser, the help, completions and man pages, and the output helpers (logs, tables, spinners, prompts) share one look.
People contributing read `CONTRIBUTING.md`; this file is the same rules, written for an agent about to change the code.

## The repository

- `src/`: one module per concern, imported by its own path (`@ensiria/cli-kit/<module>`), its types beside it in
  `<module>.types.ts`. The full reference is `docs/API.md`; the README is the landing page.
- `test/<module>.test.ts`: Vitest, one file per module.
- `bin/cli-kit.ts`: the `cli-kit` command (docs, completions, man pages for a repository's scripts).
- `examples/`: small commands built on the kit, each with its logic tested apart; `examples/gallery.ts` draws every
  helper.
- `tools/check-commits/`: the repository's own check of commit messages.
- `tools/check-internal-refs/`: the check that no tracked file points at notes outside this repository.

## Before you say a change is done

```sh
pnpm checks                                  # types, lint, tests, build: what the CI runs
node examples/gallery.ts                     # when an output helper changed: look at it
```

It must pass. A rule is never silenced to get a green run: an ignore comment only where the rule is wrong for that
case, with the reason.

## The code

- **No runtime dependency.** The kit is built on Node's own modules only; a dependency for tests or tooling goes in
  `devDependencies`, and only after an issue agreed on it.
- **The published package runs from `dist/`.** `exports` and `bin` name the compiled files, never the TypeScript
  sources (Node does not strip types inside `node_modules`); `prepack` builds them.
- TypeScript, strict. No `any` and no casts: `unknown` with narrowing. `type` for data, unions of literals instead of
  enums, arrow functions, named exports, no barrels or re-exports; relative imports carry `.ts`.
- TSDoc on every module (a block first: what it does, `@remarks` for the why, `@module`) and on everything exported:
  what it is, its defaults and units, an `@example` where the use is not obvious.
- Comments explain why the code is as it is, never its history: no dates, no names, no account of what was tried.
- No reference to notes outside this repository, in a file or a commit message: no decision ids (a `D` and a
  number), no numbered notes (`note` and a number), no private repository. A reader of this public repository cannot
  open them, so the comment or the message says the reason itself. `pnpm refs:check` (part of `pnpm checks`) and
  `check-commits` fail on them.
- Output goes through the kit's own helpers: stdout carries results only (`--json` for data); headers, logs, live
  output and prompts go to stderr. Tones, glyphs and exit codes come from `src/constants.ts`.
- Tests come with the change, on `createTestIo()` (a fake terminal, files and programs) instead of the real ones; a
  helper an example needs and the kit lacks is added to the kit, with its test, rather than written in the example.
- A public API changes on purpose: a renamed or removed export, option or behaviour is a breaking change, said so in
  the commit (`feat!:` or a `BREAKING CHANGE:` footer).

## Releases

Work goes to `develop` in conventional commits (`feat:`, `fix:`…; the version and the changelog come from them), one
change per commit with its tests. Never publish to npm or push to `main`: the maintainers release.
