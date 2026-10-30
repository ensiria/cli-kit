# `notes`

A small command line made of commands, to see `defineCommands` at work: notes kept in a JSON file, added, listed,
marked done, removed and exported as Markdown.

What it shows:

- a store option every command inherits (`--store`, or `NOTES_STORE`), given before or after the command word;
- an old command name still accepted (`rm` is now `remove`, with a note on stderr);
- a number option with a range (`--priority`, 1 to 5), a value read from stdin or a file (`--body -`,
  `--body @draft.md`), a positional checked by a schema (a note's number);
- `--json` on `list`, a table in the terminal, and a Markdown table from `formatTable` on `export`.

The logic is in `notes.ts`, pure and tested in `notes.test.ts`; `notes.mts` is the command. Its usage is generated:
`node examples/notes/notes.mts --help`.
