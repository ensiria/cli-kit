# @ensiria/cli-kit

Stop rewriting argument parsing, help, colours and Ctrl+C handling in every Node script: write the definition once.
One package gives you the parser, the help, completions and man pages, and the tools for what the script prints:
logs, tables, spinners, progress bars, prompts, and a fake terminal for tests.

> **Status:** 0.x, early. Its author's tools run on it; the API may still change between minor versions, and every
> change is in the [changelog](CHANGELOG.md).

**Requirements:** Node 22.18 or later · ES modules, which CommonJS code can load with `require()` · types included,
on Node's (`@types/node`) · no runtime dependencies · npm, pnpm, yarn (PnP too) or bun · [MIT licence](LICENSE)

## Install

```sh
npm install @ensiria/cli-kit
```

## A first script

```ts
// count-lines.ts
import { readFileSync } from "node:fs";

import { defineScript } from "@ensiria/cli-kit/script";

await defineScript({
  name: "count-lines",
  command: "node count-lines.ts",
  summary: "Count the lines of text files.",
  json: true,
  options: {
    min: { type: "number", integer: true, min: 0, default: 0, description: "Skip files with fewer lines." }
  },
  positionals: [{ name: "files", description: "The files to count.", required: true, variadic: true }],
  run: ({ args, options, log }) => {
    const counts = args.files
      .map((file) => ({ file, lines: readFileSync(file, "utf8").trimEnd().split("\n").length }))
      .filter((count) => count.lines >= options.min);
    for (const { file, lines } of counts) log.info(`${file}: ${lines}`);
    return counts;
  }
}).run();
```

Node 22.18 runs the TypeScript file as it is:

```text
$ node count-lines.ts a.txt b.txt
▸ count-lines Count the lines of text files.
› a.txt: 3
› b.txt: 1

$ node count-lines.ts a.txt --mni 2
✗ Unknown option '--mni'. Did you mean --min?
  Run node count-lines.ts --help for the options.
```

`--help`, `--json` (the returned value on stdout, logs on stderr), `--quiet`, `--verbose` and `--no-color` come with
it; `options.min` is a `number` and `args.files` a `string[]`, typed from the definition.

## Why this and not…

- **commander, yargs, citty, cac** parse arguments. cli-kit types the values from the definition, generates the help,
  shell completions, a man page and a JSON description from the same definition, and covers what the script prints.
- **@clack/prompts, ora, listr2** are polished pieces, each with its own look. Here prompts, spinner, task list,
  progress bar, tables and log lines share one look and one rule for pipes and CI (no animation, plain lines,
  `NO_COLOR`), and `createTestIo()` tests all of them without a terminal.
- **oclif** is a framework, with plugins, generators and a project layout. cli-kit is a library: a script stays one
  file.

Pick something else when your scripts must run on Node older than 22.18, you need a plugin system (oclif), your own
visual theme (cli-kit has one fixed look), or a parser with a decade of edge cases behind it (commander, yargs).

## What every script gets

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

Each is imported by its own path, `@ensiria/cli-kit/<module>`. The full reference, with every export and option, is
in [docs/API.md](docs/API.md).

| Module | What it is for |
|---|---|
| `script`, `commands` | One script, or a command line of commands in groups (`kb note add`), from one definition |
| `exec` | Run a program: arguments as an array, failures that read the same everywhere, no child left behind |
| `log`, `style`, `glyphs`, `header` | The lines a script prints, coloured by meaning, with ASCII fallbacks |
| `layout`, `text`, `format`, `markdown` | Tables, lists, trees and boxes; widths and wrapping; sizes, durations, dates; Markdown tables |
| `spinner`, `progress`, `tasks`, `timer` | Live feedback on a terminal, plain lines in a pipe or CI |
| `prompts` | `confirm`, `select`, `multiselect`, `text`, `secret`, with `--yes` and defaults without a terminal |
| `checks`, `version` | Doctor commands: programs and versions checked, a report and its exit code |
| `files`, `generated` | Write only when changed, stable JSON, generated files checked in CI |
| `docs`, `catalog` | Man pages, completions and a scripts page generated from the definitions; the `cli-kit` command that comes with the package runs them (`npx cli-kit docs`) |
| `testing` | A fake terminal and one-call runs for tests |
| `io`, `exit`, `constants` | The process, cleanups and Ctrl+C, exit codes and every constant |

## Examples

Three small commands in [`examples/`](examples), each with its logic tested apart and a README: `notes` (commands in
groups, number options, a value from stdin or a file, a schema, tables), `doctor` (`runChecks`, `checkProgram`) and
`release-notes` (`exec`, `writeGenerated`). `node examples/gallery.ts` draws every helper; try it with `| cat`,
`--no-color` and `CLI_KIT_ASCII=1`.

## Contributing

Bugs, proposals and pull requests: [CONTRIBUTING.md](CONTRIBUTING.md). Security problems: [SECURITY.md](SECURITY.md).
