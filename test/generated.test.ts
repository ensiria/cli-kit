/**
 * Tests for generated files: written only on a change, checked without writing.
 *
 * @module
 */
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXIT } from "../src/constants.ts";
import { writeGenerated } from "../src/generated.ts";
import { ScriptError } from "../src/script.ts";

describe("writeGenerated", () => {
  it("writes a file whose content changed, and leaves one that holds it already", () => {
    const folder = mkdtempSync(join(tmpdir(), "generated-"));
    const file = join(folder, "docs", "page.md");
    expect(writeGenerated(file, "one\n", { isCheck: false, command: "gen" })).toBe("written");
    const written = statSync(file).mtimeMs;
    expect(writeGenerated(file, "one\n", { isCheck: false, command: "gen" })).toBe("unchanged");
    expect(statSync(file).mtimeMs).toBe(written);
  });

  it("checks without writing: up to date passes, missing or different fails with the command as the hint", () => {
    const folder = mkdtempSync(join(tmpdir(), "generated-"));
    const file = join(folder, "page.md");
    const check = (content: string): unknown => {
      try {
        return writeGenerated(file, content, { isCheck: true, command: "pnpm docs", cwd: folder });
      } catch (error) {
        return error;
      }
    };
    expect(check("one\n")).toMatchObject({
      message: "page.md is missing",
      hint: "Run pnpm docs",
      exitCode: EXIT.failure
    });
    writeFileSync(file, "old\n");
    expect(check("one\n")).toBeInstanceOf(ScriptError);
    expect(check("one\n")).toMatchObject({ message: "page.md is not up to date" });
    expect(readFileSync(file, "utf8")).toBe("old\n");
    expect(check("old\n")).toBe("unchanged");
  });
});
