# Contributing

Thanks for helping. Bug reports, proposals and pull requests are welcome; this page says how to make each one land.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). A security problem is never a public issue:
see [SECURITY.md](SECURITY.md).

## Questions, bugs and proposals

- **A question** (how do I…, is this the right helper for…): [Discussions](https://github.com/Ensiria/cli-kit/discussions).
- **A bug**: an issue with the bug form. The version, the Node version, the package manager and a few lines that show
  it are what make it fixable.
- **A new helper or option**: an issue with the proposal form, before any code. The kit stays small on purpose, so
  agreeing on the shape first saves a pull request that cannot be merged.

## Pull requests

Small fixes (a typo, a wrong message, an obvious bug with its test) can go straight to a pull request. Anything
larger starts from an issue where the shape was agreed.

- Branch from `develop` and open the pull request against `develop`; `main` is what is released.
- One change per pull request, with its tests.
- `pnpm checks` passes locally: it is what the CI runs (types, lint, tests, build).

## Setup

Node 22.18 or later (`.nvmrc` picks 24, the CI runs both) and pnpm (the version in `package.json`, through Corepack).

```sh
corepack enable
pnpm install
pnpm test                                    # Vitest
pnpm checks                                  # everything the CI runs
node examples/gallery.ts                     # every helper, drawn
```

## The rules of the code

- **No runtime dependency.** The kit is built on Node's own modules only; a dependency for tests or tooling goes in
  `devDependencies` and is discussed in the issue first.
- **TypeScript, strict.** No `any` and no casts: `unknown` with narrowing. `type` for data, unions of literals instead
  of enums, arrow functions, named exports, no barrels or re-exports.
- **TSDoc on everything exported**: what it is, its defaults and units, and an `@example` where the use is not obvious.
  Each module starts with a TSDoc block saying what it does.
- **Tests with the change**: Vitest, in `test/<module>.test.ts`, with `createTestIo()` instead of the real terminal,
  files or programs.
- **Formatting and lint**: Biome and ESLint (`pnpm lint`, `pnpm format`).
- **A public API changes on purpose.** A renamed or removed export, option or behaviour is a breaking change: say so
  in the issue and in the commit (below).

## Commits

[Conventional Commits](https://www.conventionalcommits.org), since the version and the changelog come from them:

```
<type>(<optional scope>): <summary in the imperative>
```

| type | when | release |
|---|---|---|
| `feat` | a new helper, option or behaviour | minor (patch while 0.x) |
| `fix` | a bug fixed | patch |
| `feat!` / `fix!`, or a `BREAKING CHANGE:` footer | a change that breaks existing code | major (minor while 0.x) |
| `perf`, `refactor`, `docs`, `test`, `style`, `build`, `ci`, `chore`, `revert` | everything else | none |

`node tools/check-commits/check-commits.mts --from origin/develop` checks a branch's commits; the CI checks them too.

## Releases

The maintainers release: merging `develop` into `main` versions, tags and stages the package, and a maintainer
approves it on npm. The details are in the README, under Releasing.
