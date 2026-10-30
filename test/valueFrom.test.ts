/**
 * Tests for values read from stdin or a file: `-`, `@path`, the `@@` escape, for options and positionals, before the
 * schema; the usage errors; the help.
 *
 * @module
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { EXIT } from "../src/constants.ts";
import { defineScript } from "../src/script.ts";
import { createTestIo } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

/** What the script saw. */
const seen: unknown[] = [];

/** A note whose body and title may come from stdin or a file. */
const note = defineScript({
  name: "note",
  command: "note",
  summary: "Add a note.",
  header: false,
  options: {
    body: { type: "string", valueFrom: true, description: "The note's text." },
    tags: { type: "string", multiple: true, valueFrom: true, description: "A tag." },
    count: {
      type: "string",
      valueFrom: true,
      schema: z.string().trim().transform(Number),
      description: "A count."
    }
  },
  positionals: [{ name: "title", valueFrom: true, description: "The title." }],
  run: ({ options, args }) => {
    seen.push({ ...options, title: args.title });
  }
});

/** A folder with a file in it. */
const folderWith = (name: string, text: string): string => {
  const folder = mkdtempSync(join(tmpdir(), "cli-kit-value-from-"));
  writeFileSync(join(folder, name), text);
  return folder;
};

/**
 * Runs the note script.
 *
 * @param argv - The command line.
 * @param options - What stdin holds (closed after it), whether it is a terminal, the working folder.
 */
const runNote = async (
  argv: readonly string[],
  options: { readonly input?: string; readonly tty?: boolean; readonly cwd?: string } = {}
): Promise<{ readonly exitCode: number; readonly stderr: string }> => {
  const test = createTestIo({ input: options.input, tty: options.tty ?? false, cwd: options.cwd ?? "/" });
  test.endInput();
  const exitCode = await note.run(argv, { io: test.io });
  return { exitCode, stderr: stripAnsi(test.stderr()) };
};

describe("valueFrom", () => {
  it("reads - from stdin, @path from a file in the working folder, and takes @@ and plain text as written", async () => {
    seen.length = 0;
    const folder = folderWith("body.md", "From the file.\n");
    const run = await runNote(["--body", "@body.md", "--tags", "@@home", "--tags", "plain", "-"], {
      input: "Piped title",
      cwd: folder
    });
    expect(run.exitCode).toBe(EXIT.ok);
    expect(seen).toEqual([
      { body: "From the file.\n", tags: ["@home", "plain"], count: undefined, title: "Piped title" }
    ]);
  });

  it("reads before the schema, so it checks what was read", async () => {
    seen.length = 0;
    const folder = folderWith("count.txt", " 42\n");
    await runNote(["--count", "@count.txt", "t"], { cwd: folder });
    expect(seen).toEqual([{ body: undefined, tags: [], count: 42, title: "t" }]);
  });

  it("refuses a missing file, - on a terminal, and stdin read twice, as usage errors", async () => {
    const missing = await runNote(["--body", "@nope.md", "t"], { cwd: folderWith("x", "") });
    expect(missing.exitCode).toBe(EXIT.usage);
    expect(missing.stderr).toContain("--body @nope.md: no such file");
    const terminal = await runNote(["--body", "-", "t"], { tty: true });
    expect(terminal.stderr).toContain("--body -: nothing is piped into stdin");
    const twice = await runNote(["--body", "-", "-"], { input: "x" });
    expect(twice.stderr).toContain("<title> -: stdin can be read once");
  });

  it("says where the value may come from in the help", () => {
    expect(note.help()).toContain("--body <text|-|@file>");
    expect(note.help()).toContain("note [options] [title|-|@file]");
  });
});
