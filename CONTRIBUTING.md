# Contributing

Thanks for helping. Bug reports, proposals and pull requests are welcome; this page says how to make each one land.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). A security problem is never a public issue:
see [SECURITY.md](SECURITY.md).

## Questions, bugs and proposals

- **A question** (how do I…, is this the right helper for…): [Discussions](https://github.com/ensiria/cli-kit/discussions).
- **A bug**: an issue with the bug form. The version, the Node version, the package manager and a few lines that show
  it are what make it fixable.
- **A new helper or option**: an issue with the proposal form, before any code. The kit stays small on purpose, so
  agreeing on the shape first saves a pull request that cannot be merged.

## Pull requests

Small fixes (a typo, a wrong message, an obvious bug with its test) can go straight to a pull request. Anything
larger starts from an issue where the shape was agreed.

- Branch from `develop` and open the pull request against `develop`; `main` is what is released. Neither takes a
  direct push or a force push: every change is a pull request, merged once the checks pass and a maintainer approved
  it.
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

The message, body included, explains the change on its own: no decision ids, numbered notes or other repositories a
reader of this history cannot open. `node tools/check-commits/check-commits.mts --from origin/develop` checks a
branch's commits, their type and these references; the CI checks them too. `pnpm refs:check`, part of `pnpm checks`,
checks the files for the same references.

## Releases

Merging `develop` into `main` (a pull request, like any other change) releases the package (`.github/workflows/release.yml`, with
[Nx release](https://nx.dev/features/manage-releases)): the checks run, the version comes from the commits since the
last release (while the version is 0.x, a breaking change bumps the minor and a feature or a fix the patch, so
`^0.1.0` gets features and fixes, never a break), `CHANGELOG.md` and the GitHub release are written, the release
commit and its `v<version>` tag go to `main`, the package is staged on npm with provenance through trusted publishing
(no token), and the release commit goes back to `develop`. Those two pushes are the only direct ones the branches take: they
come from the organisation's release app (a GitHub App with write access to the contents, the rules' one exemption),
whose token the workflow makes for each run from the `RELEASE_APP_KEY` secret of the `npm` environment.

A staged version is not public yet: npm trusts the workflow to stage only, so a maintainer approves each version with
2FA, which keeps a compromised workflow from shipping one on its own:

```sh
npm stage list @ensiria/cli-kit   # the versions waiting, with their ids
npm stage approve <stage-id>      # 2FA, then the version is public
```

The package must come out of `npm pack` ready to run: `exports` and `bin` name the compiled files in `dist/` (built by
`prepack`), never the TypeScript sources, which Node does not run inside `node_modules`.

The first release is published by hand, since npm can trust a workflow only for a package that already exists: from
`main`, signed in to npm (`npm login`, with 2FA) and to GitHub (`GITHUB_TOKEN=$(gh auth token)`), run
`pnpm nx release 0.1.0 --first-release`. Then, on npmjs.com, the package's settings add the trusted publisher
(GitHub Actions, `ensiria/cli-kit`, workflow `release.yml`, environment `npm`, `npm publish` not allowed, so it can
only stage) and require 2FA with tokens disallowed, so nothing else can publish.
