#!/usr/bin/env node
/**
 * The `notes` example: a command line made of commands, with notes kept in a JSON file.
 *
 * @remarks
 * Shows `defineCommands` (a store option every command inherits, an alias for a renamed command), number options
 * with a range, a value read from stdin or a file (`--body -`, `--body @notes.md`), a positional checked by a schema,
 * `--json`, a table in the terminal and one in Markdown. `node examples/notes/notes.mts --help` lists the commands.
 *
 * @module
 */
import { resolve } from "node:path";

import { z } from "zod";

import { defineCommands } from "../../src/commands.ts";
import { readFileSafe, readJson, writeJson } from "../../src/files.ts";
import { formatRelativeTime } from "../../src/format.ts";
import { table } from "../../src/layout.ts";
import { ScriptError } from "../../src/script.ts";
import { addNote, changeNote, EMPTY_STORE, isNoteStore, listedNotes, notesMarkdown } from "./notes.ts";
import type { NoteStore } from "./notes.types.ts";

/** A note's id as typed: a whole number, given to `run` as one. */
const NOTE_ID = z.string().regex(/^\d+$/, "is not a note's number").transform(Number);

/**
 * The notes file, or an empty store when there is none yet.
 *
 * @param file - Its path.
 * @throws A `ScriptError` when the file holds something else.
 */
const readStore = (file: string): NoteStore => {
  if (readFileSafe(file) === undefined) return EMPTY_STORE;
  const store = readJson(file);
  if (!isNoteStore(store))
    throw new ScriptError(`${file} is not a notes file`, { hint: "Point --store at another file" });
  return store;
};

/**
 * The store with a note changed, or a failure naming the id.
 *
 * @param changed - The store, or undefined when no note has the id.
 * @param id - The id asked for.
 */
const found = (changed: NoteStore | undefined, id: number): NoteStore => {
  if (changed === undefined)
    throw new ScriptError(`no note ${id}`, { hint: "notes list --all shows every note" });
  return changed;
};

await defineCommands({
  name: "notes",
  command: "node examples/notes/notes.mts",
  summary: "Keep short notes in a JSON file.",
  icon: "bullet",
  options: {
    store: {
      type: "string",
      env: "NOTES_STORE",
      default: "notes.json",
      valueName: "file",
      description: "The notes file, from the working folder."
    }
  },
  aliases: { rm: "remove" },
  commands: (notes) => ({
    add: notes.command({
      summary: "Add a note.",
      options: {
        body: { type: "string", valueFrom: true, description: "The text under the note." },
        tag: { type: "string", short: "t", multiple: true, description: "A tag; give it again for more." },
        priority: {
          type: "number",
          short: "p",
          integer: true,
          min: 1,
          max: 5,
          default: 3,
          description: "From 1 (low) to 5 (urgent)."
        }
      },
      positionals: [{ name: "title", required: true, description: "The note, one line." }],
      examples: [
        { command: 'notes add "Call the bank" -p 5 -t home', description: "An urgent note with a tag." },
        { command: "pbpaste | notes add Draft --body -", description: "The body from stdin." }
      ],
      run: ({ options, args, io, log }) => {
        const file = resolve(io.cwd, options.store);
        const store = addNote(
          readStore(file),
          { title: args.title, body: options.body ?? "", tags: options.tag, priority: options.priority },
          Date.now()
        );
        writeJson(file, store);
        log.success(`added note ${store.nextId - 1}`);
      }
    }),
    list: notes.command({
      summary: "List the open notes, most urgent first.",
      json: true,
      options: {
        tag: { type: "string", short: "t", description: "Only the notes with this tag." },
        all: { type: "boolean", short: "a", description: "The done notes too." }
      },
      run: ({ options, io, log, style, isJson }) => {
        const listed = listedNotes(readStore(resolve(io.cwd, options.store)).notes, {
          tag: options.tag,
          isAll: options.all
        });
        if (isJson) return listed;
        if (listed.length === 0) {
          log.info("no notes");
          return undefined;
        }
        const now = Date.now();
        log.plain(
          table(
            listed.map((note) => [
              note.id,
              note.isDone ? `${note.title} (done)` : note.title,
              note.priority,
              note.tags.join(", "),
              formatRelativeTime(note.createdAt, now)
            ]),
            {
              columns: [
                { header: "#" },
                { header: "Note", maxWidth: 40 },
                { header: "Priority" },
                { header: "Tags", tone: "muted" },
                { header: "Added", tone: "muted" }
              ]
            },
            style
          )
        );
        return undefined;
      }
    }),
    done: notes.command({
      summary: "Mark a note done.",
      positionals: [{ name: "id", required: true, schema: NOTE_ID, description: "The note's number." }],
      run: ({ options, args, io, log }) => {
        const file = resolve(io.cwd, options.store);
        writeJson(
          file,
          found(
            changeNote(readStore(file), args.id, (note) => ({ ...note, isDone: true })),
            args.id
          )
        );
        log.success(`note ${args.id} done`);
      }
    }),
    remove: notes.command({
      summary: "Remove a note.",
      positionals: [{ name: "id", required: true, schema: NOTE_ID, description: "The note's number." }],
      run: ({ options, args, io, log }) => {
        const file = resolve(io.cwd, options.store);
        writeJson(
          file,
          found(
            changeNote(readStore(file), args.id, () => undefined),
            args.id
          )
        );
        log.success(`note ${args.id} removed`);
      }
    }),
    export: notes.command({
      summary: "Print every note as a Markdown table.",
      header: false,
      options: { padded: { type: "boolean", description: "Align the columns." } },
      run: ({ options, io }) => {
        io.stdout.write(
          `${notesMarkdown(readStore(resolve(io.cwd, options.store)).notes, options.padded)}\n`
        );
      }
    })
  })
}).run();
