/**
 * Tests for the `notes` example: its logic, and the command run as a process on a notes file of its own.
 *
 * @module
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXIT } from "../../src/constants.ts";
import { runScriptProcess } from "../../src/testing.ts";
import { addNote, changeNote, EMPTY_STORE, isNoteStore, listedNotes, notesMarkdown } from "./notes.ts";

/** Three notes: an urgent one, a done one, a tagged one. */
const STORE = [
  { title: "Call the bank", body: "", tags: ["home"], priority: 5 },
  { title: "Draft", body: "text", tags: ["work"], priority: 3 },
  { title: "Read <paper>", body: "", tags: ["work"], priority: 3 }
].reduce((store, input, index) => addNote(store, input, index), EMPTY_STORE);
const WITH_DONE = changeNote(STORE, 2, (note) => ({ ...note, isDone: true })) ?? STORE;

describe("notes", () => {
  it("numbers the notes, lists the open ones most urgent first, by tag or all", () => {
    expect(listedNotes(WITH_DONE.notes, { tag: undefined, isAll: false }).map((note) => note.id)).toEqual([
      1, 3
    ]);
    expect(listedNotes(WITH_DONE.notes, { tag: "work", isAll: true }).map((note) => note.id)).toEqual([2, 3]);
  });

  it("changes or removes a note by its id, and says when none has it", () => {
    expect(changeNote(STORE, 1, () => undefined)?.notes.map((note) => note.id)).toEqual([2, 3]);
    expect(changeNote(STORE, 9, () => undefined)).toBeUndefined();
  });

  it("writes the notes as a Markdown table, tags as code, titles escaped", () => {
    expect(notesMarkdown(WITH_DONE.notes, false)).toBe(
      [
        "| # | Note | Priority | Tags | State |",
        "|---:|---|:---:|---|---|",
        "| 1 | Call the bank | 5 | `home` | open |",
        "| 2 | Draft | 3 | `work` | done |",
        "| 3 | Read \\<paper\\> | 3 | `work` | open |"
      ].join("\n")
    );
  });

  it("tells a notes file from anything else", () => {
    expect(isNoteStore(WITH_DONE)).toBe(true);
    expect(isNoteStore({ nextId: 1, notes: [{ id: 1 }] })).toBe(false);
  });

  it("runs as a command: adds, marks done and lists as JSON, with a usage error for a wrong id", () => {
    const store = join(mkdtempSync(join(tmpdir(), "notes-")), "notes.json");
    const entry = join(import.meta.dirname, "notes.mts");
    const env = { NOTES_STORE: store };
    expect(runScriptProcess(entry, ["add", "Call the bank", "-p", "5"], env).exitCode).toBe(EXIT.ok);
    expect(runScriptProcess(entry, ["done", "1"], env).exitCode).toBe(EXIT.ok);
    const listed = runScriptProcess(entry, ["list", "--all", "--json"], env);
    expect(JSON.parse(listed.stdout)).toMatchObject([
      { id: 1, title: "Call the bank", priority: 5, isDone: true }
    ]);
    expect(runScriptProcess(entry, ["add", "Too urgent", "-p", "9"], env).stderr).toContain(
      "--priority must be between 1 and 5 (got 9)"
    );
    expect(runScriptProcess(entry, ["done", "x"], env).exitCode).toBe(EXIT.usage);
    expect(JSON.parse(readFileSync(store, "utf8"))).toMatchObject({ nextId: 2 });
  });
});
