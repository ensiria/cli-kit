/**
 * Tests for the catalogue: reading `scripts.json`, describing real scripts in child processes, and the generated
 * reference.
 *
 * @module
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  describeScript,
  formatScriptsMarkdown,
  generateDocs,
  isScriptDescription,
  readCatalog,
  sourceFromDescription
} from "../src/catalog.ts";
import { formatHelpJson } from "../src/docs.ts";
import type { HelpSource } from "../src/help.types.ts";

const KIT = join(import.meta.dirname, "..", "src", "script.ts");
let root = "";

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cli-kit-catalog-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes a script built on the kit into the temporary repo. */
const writeScript = (path: string, name: string): void => {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(
    join(root, path),
    `import { defineScript } from ${JSON.stringify(KIT)};\n` +
      `await defineScript({ name: ${JSON.stringify(name)}, command: "node ${path}", summary: "Does <things>.", ` +
      `options: { fast: { type: "boolean", description: "Go fast." } }, run: () => { throw new Error("ran"); } }).run();\n`
  );
};

describe("readCatalog", () => {
  it("reads the entries", () => {
    writeFileSync(
      join(root, "scripts.json"),
      '{ "scripts": [{ "path": "a.ts" }, { "path": "b.ts", "man": true }] }'
    );
    expect(readCatalog(root)).toEqual([
      { path: "a.ts", man: false },
      { path: "b.ts", man: true }
    ]);
  });

  it("names what is wrong", () => {
    writeFileSync(join(root, "scripts.json"), "[]");
    expect(() => readCatalog(root)).toThrow('scripts.json must be { "scripts"');
    writeFileSync(join(root, "scripts.json"), '{ "scripts": [{}] }');
    expect(() => readCatalog(root)).toThrow("scripts[0] needs a");
  });
});

describe("describeScript", () => {
  it("gets the description from the script itself, without running it", () => {
    writeScript("tools/a.ts", "alpha");
    const description = describeScript(root, { path: "tools/a.ts" }, {});
    expect(description).toMatchObject({ schema: 1, name: "alpha", summary: "Does <things>." });
  });

  it("fails for a missing file or a script not on the kit", () => {
    expect(() => describeScript(root, { path: "nope.ts" }, {})).toThrow(
      "is listed in scripts.json but does not exist"
    );
    writeFileSync(join(root, "plain.mjs"), 'console.log("hello");\n');
    expect(() => describeScript(root, { path: "plain.mjs" }, {})).toThrow("did not describe itself");
  });
});

describe("the reference", () => {
  const source: HelpSource = {
    name: "alpha",
    command: "node a.ts",
    summary: "Does <things>.",
    options: { fast: { type: "boolean", description: "Go fast." } }
  };
  const scripts = [{ entry: { path: "a.ts", man: true }, description: formatHelpJson(source) }];

  it("round-trips a description to a help source", () => {
    expect(isScriptDescription(formatHelpJson(source))).toBe(true);
    expect(isScriptDescription({ schema: 2 })).toBe(false);
    expect(sourceFromDescription(formatHelpJson(source))).toMatchObject({
      name: "alpha",
      options: { fast: { type: "boolean", description: "Go fast." } }
    });
  });

  it("lists every script, then each one's help, escaped for Markdown", () => {
    const markdown = formatScriptsMarkdown(scripts);
    expect(markdown).toContain("| [`alpha`](#alpha) | Does \\<things\\>. | `a.ts` |");
    expect(markdown).toContain("### `alpha`\n\nDoes \\<things\\>.");
    expect(markdown).toContain("File: `a.ts`");
  });

  it("adds man pages for the entries that ask", () => {
    expect([...generateDocs(scripts).keys()]).toEqual(["docs/scripts.md", "docs/man/alpha.1"]);
  });
});
