# `@ensiria/cli-kit`

Helpers and constants for scripts and command-line tools that all look and behave the same: options, validation and
generated help, output lines with glyphs and tones, cleanups and Ctrl+C, files, and a fake terminal for tests. MIT.
The plan, the principles and the roadmap are in `docs/plans/cli-kit-plan.md`.

Node ≥ 24 runs the TypeScript sources directly; there is no build step for use inside the monorepo. Every module is
imported by its own path (`@ensiria/cli-kit/<module>`); types live next to it in `<module>.types`.

```ts
import { writeIfChanged } from "@ensiria/cli-kit/files";
import { defineScript, ScriptError } from "@ensiria/cli-kit/script";

await defineScript({
  name: "build-order",
  command: "node tools/build-order/build-order.mts",
  summary: "Recompute the build order in BUILD-ORDER.md from its table.",
  options: { check: { type: "boolean", short: "c", description: "Fail when the file is not in order." } },
  examples: [{ command: "node tools/build-order/build-order.mts --check", description: "Check the order in CI." }],
  run: ({ options, log }) => {
    if (options.check) throw new ScriptError("not in order", { hint: "Run node tools/build-order/build-order.mts" });
    log.success(writeIfChanged(FILE, next) ? "recomputed" : "already up to date");
  }
}).run();
```

## Where a script lives

One folder per script, named after the command: `<command>.mts` (the definition and the run), `<name>.ts` (the
logic, imported by the tests), `<name>.types.ts`, `<name>.test.ts` and a `README.md` (why and how; the usage stays
generated). `packages/design-system/tools/build-order/` is the example; docs/plans/cli-kit-plan.md has the rule.

## Behaviour every script gets

- `--help` / `-h`, generated from the definition; `--quiet` / `-q`; `--verbose` / `-v`; `--no-color`.
- `--version` / `-V` when the definition has a `version` (`readPackageVersion(import.meta.dirname)` reads it).
- `--json` when the definition sets `json: true`: the value `run` returns is printed as the only thing on stdout
  (stable two-space JSON); every log line, the header excluded, goes to stderr.
- A header line (`▸ name summary`) on **stderr**, so a piped stdout holds only results; hidden by `--quiet` and
  `--json`.
- `CLI_KIT_DESCRIBE=1` prints the script's JSON description and exits without running (how `cli-kit docs` reads it).
- Usage errors (unknown option, missing required argument, too many arguments, a value outside `choices`, a bad
  boolean in an environment variable) print one line plus "Run … --help" and exit with `EXIT.usage` (2).
- A thrown `ScriptError` prints its message and hint and exits with its code; anything else thrown exits with
  `EXIT.failure` (1), its stack shown with `--verbose`.
- Cleanups registered with `onExit` run after success, after a failure and on Ctrl+C / SIGTERM (last registered
  first); a signal shows the cursor again and exits with 130 / 143.
- Colour follows `NO_COLOR` / `FORCE_COLOR` and turns off when the output is not a terminal; glyphs fall back to ASCII
  with `TERM=dumb` or `CLI_KIT_ASCII=1`.

## Modules

### `script`

| Export | What it is |
|---|---|
| `defineScript(definition)` | Describes a script; returns `{ run(argv?, { io? }), help(color?), markdown(), source }`. `run` resolves to the exit code and sets the process exit code |
| `ScriptError(message, { exitCode?, hint?, isReported? })` | An expected failure: one error line, an optional hint, no stack; `isReported` exits with the code silently (the script already printed the problem) |
| `usageError(message)` | A `ScriptError` with `EXIT.usage` and the "Run … --help" hint |

The definition (`script.types`: `ScriptDefinition`):

| Field | What it is |
|---|---|
| `name`, `command`, `summary` | Required: short name, how it is run, one line |
| `description` | Longer text for `--help` |
| `version` | Adds `--version` / `-V` |
| `json` | Adds `--json` |
| `prompts` | Adds `--yes` / `-y` |
| `icon`, `tone` | The header's glyph and its tone |
| `header` | `false` for helpers run by programs that read their stderr (no header line) |
| `options` | `{ [longName]: ScriptOption }` |
| `positionals` | `ScriptPositional[]`, required first, a variadic or raw one last |
| `examples` | `{ command, description }[]` |
| `run(context)` | The work; may be async; its return value is the `--json` document |

`ScriptOption` (`help.types`): `type` (`"boolean"` / `"string"`), `description`, `short`, `valueName`, `multiple`,
`default` (strings), `choices` (strings, validated, offered by completions), `env` (the variable read when the option
is not on the command line: booleans accept `1/true/yes` and `0/false/no`, a multiple string splits on commas),
`required` (strings: a usage error when there is no value after the command line, `env` and `default`), `value`
(`"required"`, the default: `--base main`; `"optional"`: `--color` alone takes `impliedValue`, `--color=never` its own
value, attached with `=` or `-cnever` so it is never confused with a positional).
`ScriptPositional`: `name`, `description`, `required`, `variadic`, `raw`, `choices`. A `raw` positional (the last one)
takes every argument after the positionals before it **as it is**, options included, without parsing them: the
arguments a wrapper hands to the command it runs (`node mcp-supervisor.mts <cli> --cdp-endpoint …`). The script's own
options go before it, so `--help` still works; a raw positional with none before it takes the whole command line.

Values are typed from the declarations: a boolean is `boolean`; a string is `string | undefined`, or `string` with a
`default` or `required`, or the union of its `choices`; `multiple` makes an array. Positionals arrive by name in `args`
(`string` when required, `string | undefined` when not, `string[]` when variadic or raw).

Rules between options (one needs or excludes another) stay in `run`, checked by hand and thrown as `usageError`, so
they print like every other usage error (exit 2, "Run … --help"):

```ts
run: ({ options }) => {
  if (options.to && !options.from) throw usageError("--to needs --from");
}
```

The context (`ScriptContext`): `options`, `args`, `positionals` (raw), `path` (the command words it was called through,
empty for a script), `log`, `style` (`{ color, unicode, width }` for the rendering helpers), `io`, `isJson`, `isYes`,
`onExit(cleanup)` (returns a remover), `onInterrupt(handler)` (a graceful stop: the first Ctrl+C calls it and the run
ends when `run` returns; a second one exits at once).

### `commands`

A command line made of named commands, nested in groups to any depth (`radar-kb note add`):

```ts
import { defineCommands } from "@ensiria/cli-kit/commands";

await defineCommands({
  name: "radar-kb",
  command: "radar-kb",
  summary: "Notes, decisions and plans of the project's knowledge",
  options: { project: { type: "string", env: "RADAR_PROJECT", description: "The project." } },
  aliases: { "re-index": "reindex" },
  commands: (kb) => ({
    note: kb.group({
      summary: "The notes",
      commands: (note) => ({
        add: note.command({
          summary: "Add a note",
          options: { pin: { type: "boolean", description: "Keep it at the top." } },
          // options.project: string | undefined (the group's), options.pin: boolean (its own)
          run: ({ options, path, log }) => log.info(`${path.join(" ")} in ${options.project ?? "every project"}`)
        })
      })
    }),
    reindex: kb.command({ summary: "Rebuild the index", run: () => undefined })
  })
}).run();
```

| Export | What it is |
|---|---|
| `defineCommands(definition)` | Describes the top group; returns what `defineScript` returns (`run`, `help`, `markdown`, `source`), its help and docs covering every command |

A group's `commands` receives a scope: `scope.command(definition)` makes a command that runs (the fields of
`defineScript` but `name`, `command` and `version`), `scope.group(definition)` a group under a word of its own (its
`summary`, `options`, `examples`, `aliases` and `commands`). The scope carries the types of the options above it, so a
command's `run` receives its groups' options and its own, typed; the commands are declared through it because
TypeScript cannot type them from a plain object. The top adds `name`, `command` and `version`.

- **Options** of a group apply to every command under it and may be given before or after the command words
  (`radar-kb --project x note add`, `radar-kb note add --project x`); a command's own go after its word. A name
  declared twice on one path is an error when the tree is defined.
- **Settings** (`header`, `icon`, `tone`, `json`, `prompts`, `onFailure`) are inherited from the group unless a command
  sets its own. The header shows the whole path.
- **A group without a command** is a usage error listing its commands; `--help` at any level prints that level's help
  (its commands, its options, the inherited ones apart); `--version` works at the top.
- **Renames**: a group's `aliases` (`{ "old-name": "new-name" }`) keep an old word working, with a note on stderr.
- **Docs**: the JSON description, Markdown, man page and completions cover the whole tree (bash, zsh and fish complete
  the command words, then the options of the command they lead to); `cli-kit docs` lists a tree as one script.

### `log`

`createLogger({ stdout, stderr, quiet?, verbose?, json?, color?, colorStderr?, unicode? })` → `info`, `success`,
`step` (stdout), `warn`, `error`, `hint` (stderr), `debug` (stdout, only with `verbose`), `plain` (no glyph), and
`style`. `quiet` keeps warnings and errors; `json` moves everything to stderr.

### `style`, `glyphs`

| Export | What it is |
|---|---|
| `paint(tone, text, color)` | Styles text by meaning (`Tone`: `neutral`, `accent`, `success`, `warning`, `danger`, `muted`, `strong`) |
| `supportsColor(stream, env)` | `NO_COLOR`, `FORCE_COLOR`, then whether the stream is a terminal |
| `glyph(name, unicode)` | The Unicode or ASCII form of a glyph (`GlyphName`) |
| `pick(pair, unicode)` | The same choice for any `{ unicode, ascii }` pair (symbols, spinner frames) |
| `supportsUnicode(env)` | Off for `TERM=dumb` and `CLI_KIT_ASCII=1` |

### `constants`

The single source for every script: `EXIT` (`ok` 0, `failure` 1, `usage` 2, `interrupted` 130, `terminated` 143),
`TONES` (tone → `util.styleText` format), `GLYPHS`, `SPINNER` (Kaji's waves: frames and interval), `SYMBOLS`
(separators, ellipsis, box, table, tree and bar characters), `DURATION` (refresh rates), `ENV` (the variables the
kit reads), `ANSI` (cursor and line control). All `as const`.

### `io`

| Export | What it is |
|---|---|
| `processIo()` | The real process as a `ScriptIo` (`argv`, `stdout`, `stderr`, `stdin`, `env`, `signals`, `setExitCode`, `exit`) |
| `terminalWidth(stream, fallback?)` | Columns of a terminal, 80 for a pipe, at least 20 |
| `isInteractive(stream, env)` | A terminal that is not `TERM=dumb` and not CI: live output may redraw |
| `isCi(env)` | Whether `CI` is set |

### `files`

| Export | What it is |
|---|---|
| `writeIfChanged(path, content)` | Writes only when the content differs; creates folders; returns whether it wrote |
| `readJson(path)` | Parses a JSON file (`unknown`), errors naming the file |
| `writeJson(path, value)` / `formatJson(value)` | Stable two-space JSON with a final newline, written only when changed |
| `findUp(name, from)` | The nearest file or folder with that name, up to the root |
| `readPackageVersion(from)` | The nearest `package.json`'s `version` |

### `markdown`

For generators that keep a Markdown file in sync with data and leave the prose alone.

| Export | What it is |
|---|---|
| `findTable(text, isHeader)` | The first table whose header matches: `{ header, rows, firstRow, end }` (line indexes) |
| `splitTableRow(line)` / `formatTableRow(cells)` | A table line to trimmed cells (escaped `\|` kept) and back |
| `readSection(text, heading)` / `replaceSection(text, heading, body)` | A section's body, up to the next heading of the same level or higher |
| `escapeMarkdown(text)` / `escapeTableCell(text)` | `<` `>` (and `\|` in cells) escaped |

### `exit`

`createExitHooks()` → `{ add(cleanup), runAll() }`; `listenForSignals(io, onSignal)`. `defineScript` uses both; a
script only calls `onExit`.

### `header`

`header({ name, summary, icon?, tone?, version? }, style)`: the opening line. `defineScript` prints it from the
definition's `icon` (a `GlyphName`, default `arrow`) and `tone` (default `accent`) so each script is recognisable.

### `text`

Widths are display columns (CJK and emoji 2, combining marks and escape codes 0).

| Export | What it is |
|---|---|
| `stripAnsi(text)` | Removes escape codes |
| `width(text)` | Display width of the widest line |
| `pad(text, columns, align?)` | Pads by display width, escape codes ignored |
| `truncate(text, columns, { unicode? })` | Cuts the end with `…` / `...` |
| `middleTruncate(text, columns, { unicode?, tail? })` | Cuts the middle: the head shrinks, the tail (a path's last segment) stays, Kaji's `MiddleTruncate` rule |
| `wrap(text, columns)` | Word wrap, long words broken, line breaks kept |
| `indent(text, prefix?)` | Indents non-empty lines (spaces or a prefix) |
| `link(text, url, enabled)` / `supportsLinks(stream, env)` | OSC 8 hyperlinks where the terminal shows them, `text (url)` elsewhere |

### `layout`

Each returns a string for `log.plain`, laid out with the run's `style` (colour, Unicode, width).

| Export | What it is |
|---|---|
| `table(rows, { columns, border?, hideHeader? }, style)` | Aligned columns (`header`, `align`, `truncate: "end" \| "middle"`, `maxWidth`, `tone`); numbers right-aligned and grouped; shrinks the widest columns to fit the terminal |
| `keyValue(entries, style)` | Muted labels, aligned values |
| `list(items, style, { ordered? })` | Bullets or numbers, nested items |
| `tree(root, style)` | Branch lines |
| `box(content, style, { title?, tone?, padding? })` | A titled panel |
| `columns(items, style)` | Short items in as many columns as fit, like `ls` |

### `format`

On `Intl`, English by default, a locale as the last argument: `formatDuration(ms)` (`850 ms`, `1.2 s`, `3 min 4 s`),
`formatBytes(bytes)` (decimal: `1.2 kB`), `formatCount(n, { compact? })`, `formatRelativeTime(moment, now)`
(`5 minutes ago`), `plural(count, singular, pluralForm?)` (`3 files`).

## Live feedback

Live output is drawn on **stderr** (stdout keeps results and `--json`), animated only on an interactive terminal
(not a pipe, not CI, not `TERM=dumb`, not `--quiet`); elsewhere each helper prints plain lines. Each takes a target
`{ io, log, onExit? }`: a script passes its `run` context. Ctrl+C clears the frame and shows the cursor.

| Export | What it is |
|---|---|
| `spinner(text, target)` (`spinner`) | Kaji's waves; `update`, `succeed`, `fail`, `warn`, `stop`; a pipe gets a `step` line and the result |
| `progress({ label, total?, unit? }, target)` (`progress`) | Bar with count, %, rate and time left, redrawn at most every 100 ms; indeterminate without a total; `tick`, `set`, `setTotal`, `update`, `done`, `fail`; a pipe gets a line every 2 s |
| `tasks(list, target, { concurrency?, continueOnError? })` (`tasks`) | A step list (pending, running, done, failed, skipped), nested `children`, `skip()`, a handle with `setTitle` / `setDetail`; throws a `ScriptError` naming the first failure; returns each task's `TaskResult` |
| `timer()` (`timer`) | `elapsed()`, `format()` (`1.2 s`), `reset()` |
| `createLiveRegion(stream, unicode)`, `canAnimate(target)`, `startLiveRun(target, region, ticker)` (`live`) | The redraw-in-place block under the helpers above, and their lifetime (the timer, the end Ctrl+C runs too) |

## Prompts

`prompts`: `confirm`, `select`, `multiselect`, `text`, `secret`, on `node:readline` (arrows or j/k, Space, `a` for
all, Enter; Ctrl+C exits 130). A script that asks sets `prompts: true` and gets `--yes` / `-y` (`isYes` in the
context). Without a terminal, or with `--yes`, each prompt takes its default (a confirmation answers yes with `--yes`);
with no default it fails with a usage error instead of hanging. `secret` never has a default: pass secrets with an
`env` option.

```ts
const env = await select({ message: "Deploy to?", choices: ["dev", "prod"], default: "dev" }, context);
if (!(await confirm({ message: `Deploy to ${env}?` }, context))) return;
```

## Docs generation

`docs` (from a definition, `script.source`): `formatHelpJson` (a fixed-shape `ScriptDescription`, `schema: 1`),
`formatHelpMan` (roff, section 1), `formatCompletion(source, "bash" | "zsh" | "fish", commandName?)`.

`catalog`: the scripts listed in `scripts.json` at the repo root (`{ "scripts": [{ "path": "…", "man"?: true }] }`),
each described by running it with `CLI_KIT_DESCRIBE=1` (`readCatalog`, `describeScript`, `generateDocs`,
`formatScriptsMarkdown`).

The `cli-kit` command:

```sh
npx cli-kit docs            # writes docs/scripts.md (+ docs/man/<name>.1 for "man" entries)
npx cli-kit docs --check    # CI: fails when they are out of date
npx cli-kit completion <script> --shell zsh --as <command>
npx cli-kit man <script>
```

A new script built on the kit is added to `scripts.json`, then `cli-kit docs` is run; CI runs the check.

## Gallery

`node examples/gallery.ts [sections...]` prints every helper; try it with `| cat`, `--no-color`
and `CLI_KIT_ASCII=1`.

### `testing`

| Export | What it is |
|---|---|
| `createTestIo({ tty?, columns?, env?, input?, argv? })` | A fake terminal: `io`, `stdout()`, `stderr()`, `output()` (both, in order), `type(text)`, `endInput()`, `signal(name)`, `exitedWith()`, `exitCode()` |
| `runScript(script, argv?, options?)` | Runs a script on a fake terminal: `{ exitCode, stdout, stderr, rawStdout, rawStderr }` (the plain ones without escape codes) |
| `runScriptProcess(path, argv?, env?)` | Runs a script file as its own Node process, colour off and only `env` in its environment: `{ exitCode, stdout, stderr }`; for an entry that calls `.run()` when loaded |

```ts
const run = await runScript(script, ["--check"], { tty: true, env: { CI: "1" } });
expect(run.exitCode).toBe(EXIT.ok);
expect(run.stdout).toContain("valid");
```

## Develop

```sh
pnpm test                                    # Vitest
pnpm typecheck                               # types, tests included
```
