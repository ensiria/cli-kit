/**
 * The logic of the `notes` example: the notes file read and checked, notes added, done and removed, filtered for a
 * list, and written as a Markdown table. Pure: the command reads and writes the file.
 *
 * @module
 */
import { codeSpan, formatTable, markdownText } from "../../src/markdown.ts";
import type { Note, NoteInput, NoteStore } from "./notes.types.ts";

/** A store with no note yet. */
export const EMPTY_STORE: NoteStore = { nextId: 1, notes: [] };

/** Whether a value is a plain object. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether a value is a note as the file keeps it. */
const isNote = (value: unknown): value is Note =>
  isRecord(value) &&
  typeof value["id"] === "number" &&
  typeof value["title"] === "string" &&
  typeof value["body"] === "string" &&
  Array.isArray(value["tags"]) &&
  value["tags"].every((tag) => typeof tag === "string") &&
  typeof value["priority"] === "number" &&
  typeof value["isDone"] === "boolean" &&
  typeof value["createdAt"] === "number";

/**
 * Whether what the notes file holds is a store.
 *
 * @param value - The parsed file.
 */
export const isNoteStore = (value: unknown): value is NoteStore =>
  isRecord(value) &&
  typeof value["nextId"] === "number" &&
  Array.isArray(value["notes"]) &&
  value["notes"].every(isNote);

/**
 * The store with a new note, the next id given to it.
 *
 * @param store - The notes so far.
 * @param input - The note.
 * @param now - When it is added, in ms since the Unix epoch.
 */
export const addNote = (store: NoteStore, input: NoteInput, now: number): NoteStore => ({
  nextId: store.nextId + 1,
  notes: [...store.notes, { ...input, id: store.nextId, isDone: false, createdAt: now }]
});

/**
 * The store with one note changed, or undefined when no note has the id.
 *
 * @param store - The notes.
 * @param id - The note's id.
 * @param change - What becomes of it; undefined removes it.
 */
export const changeNote = (
  store: NoteStore,
  id: number,
  change: (note: Note) => Note | undefined
): NoteStore | undefined => {
  if (!store.notes.some((note) => note.id === id)) return undefined;
  return {
    ...store,
    notes: store.notes.flatMap((note) => {
      if (note.id !== id) return [note];
      const changed = change(note);
      return changed === undefined ? [] : [changed];
    })
  };
};

/**
 * The notes a list shows: open ones (every one with `isAll`), with a tag when one is given, most urgent first.
 *
 * @param notes - Every note.
 * @param filter - Which to show.
 */
export const listedNotes = (
  notes: readonly Note[],
  filter: { readonly tag: string | undefined; readonly isAll: boolean }
): Note[] =>
  notes
    .filter(
      (note) => (filter.isAll || !note.isDone) && (filter.tag === undefined || note.tags.includes(filter.tag))
    )
    .toSorted((left, right) => right.priority - left.priority || left.id - right.id);

/**
 * The notes as a Markdown table, for a README or a report.
 *
 * @param notes - The notes.
 * @param isPadded - Whether the columns are aligned.
 */
export const notesMarkdown = (notes: readonly Note[], isPadded: boolean): string =>
  formatTable(
    [
      { key: "id", title: "#", align: "right" },
      { key: "title", title: "Note" },
      { key: "priority", title: "Priority", align: "center" },
      { key: "tags", title: "Tags" },
      { key: "state", title: "State" }
    ],
    notes.map((note) => ({
      id: note.id,
      title: note.title,
      priority: note.priority,
      // each tag as code, the cell as the Markdown they make
      tags: markdownText(note.tags.map((tag) => codeSpan(tag).markdown).join(" ")),
      state: note.isDone ? "done" : "open"
    })),
    { isPadded }
  );
