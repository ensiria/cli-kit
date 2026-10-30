/**
 * The types of the `notes` example: a note, and the file that keeps them.
 *
 * @module
 */

/** One note. */
export interface Note {
  /** Its number, given when it is added and never reused. */
  readonly id: number;
  /** One line. */
  readonly title: string;
  /** The text under it; empty when none. */
  readonly body: string;
  /** Its tags. */
  readonly tags: readonly string[];
  /** From 1 (low) to 5 (urgent). */
  readonly priority: number;
  /** Whether it is done. */
  readonly isDone: boolean;
  /** When it was added, in ms since the Unix epoch. */
  readonly createdAt: number;
}

/** What the notes file holds. */
export interface NoteStore {
  /** The id the next note gets. */
  readonly nextId: number;
  /** The notes, oldest first. */
  readonly notes: readonly Note[];
}

/** What a new note is given. */
export type NoteInput = Pick<Note, "title" | "body" | "tags" | "priority">;
