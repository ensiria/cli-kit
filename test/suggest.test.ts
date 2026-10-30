/**
 * Tests for "Did you mean": the edit distance, the suggestions (the closest within two edits, ties listed, or the one
 * word a prefix starts), and the hints of an unknown option and an unknown command.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { defineCommands } from "../src/commands.ts";
import { EXIT } from "../src/constants.ts";
import { defineScript } from "../src/script.ts";
import { didYouMean, editDistance, suggestions } from "../src/suggest.ts";
import { runScript } from "../src/testing.ts";

describe("suggestions", () => {
  it("counts edits", () => {
    expect(editDistance("nte", "note")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "ab")).toBe(2);
  });

  it("suggests the closest words within two edits, every one as close, or the one a prefix starts", () => {
    expect(suggestions("nte", ["note", "plan", "reindex"])).toEqual(["note"]);
    expect(suggestions("add", ["and", "odd", "plan"])).toEqual(["and", "odd"]);
    expect(suggestions("rei", ["note", "reindex"])).toEqual(["reindex"]);
    expect(suggestions("re", ["reindex", "rename"])).toEqual([]);
    expect(suggestions("zzzz", ["note", "plan"])).toEqual([]);
  });

  it("writes the sentence, listing ties", () => {
    expect(didYouMean("nte", ["note"])).toBe(" Did you mean note?");
    expect(didYouMean("add", ["and", "odd"])).toBe(" Did you mean and or odd?");
    expect(didYouMean("zzzz", ["note"])).toBe("");
  });
});

describe("in usage errors", () => {
  const script = defineScript({
    name: "s",
    command: "s",
    summary: "S.",
    header: false,
    options: { color: { type: "string", description: "C." } },
    run: () => undefined
  });

  it("suggests an option close to an unknown one, and nothing when none is", async () => {
    const close = await runScript(script, ["--colr", "x"]);
    expect(close.exitCode).toBe(EXIT.usage);
    expect(close.stderr).toContain("Unknown option '--colr'. Did you mean --color?");
    const far = await runScript(script, ["--zzzzzz"]);
    expect(far.stderr).toContain("Unknown option '--zzzzzz'");
    expect(far.stderr).not.toContain("Did you mean");
  });

  it("suggests a command close to an unknown word, and runs nothing", async () => {
    let hasRun = false;
    const kb = defineCommands({
      name: "kb",
      command: "kb",
      summary: "K.",
      commands: (top) => ({
        note: top.command({
          summary: "N.",
          run: (): void => {
            hasRun = true;
          }
        })
      })
    });
    const run = await runScript(kb, ["nte"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("unknown command nte. Did you mean note?");
    expect(hasRun).toBe(false);
  });
});
