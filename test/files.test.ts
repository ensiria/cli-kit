/**
 * Tests for the file helpers, on a temporary folder.
 *
 * @module
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findUp, formatJson, readJson, readPackageVersion, writeIfChanged, writeJson } from "../src/files.ts";

let folder = "";

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "cli-kit-"));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe("writeIfChanged", () => {
  it("writes a new file, creating its folders", () => {
    const path = join(folder, "a", "b", "out.txt");
    expect(writeIfChanged(path, "one")).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("one");
  });

  it("leaves a file with the same content untouched", () => {
    const path = join(folder, "out.txt");
    writeFileSync(path, "same");
    const before = statSync(path).mtimeMs;
    expect(writeIfChanged(path, "same")).toBe(false);
    expect(statSync(path).mtimeMs).toBe(before);
  });

  it("rewrites a file whose content changed", () => {
    const path = join(folder, "out.txt");
    writeFileSync(path, "old");
    expect(writeIfChanged(path, "new")).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("new");
  });
});

describe("JSON", () => {
  it("formats with two spaces and a final newline", () => {
    expect(formatJson({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
  });

  it("writes only when the value changed, and reads it back", () => {
    const path = join(folder, "data.json");
    expect(writeJson(path, { a: 1 })).toBe(true);
    expect(writeJson(path, { a: 1 })).toBe(false);
    expect(readJson(path)).toEqual({ a: 1 });
  });

  it("names the file when it is missing or broken", () => {
    expect(() => readJson(join(folder, "missing.json"))).toThrow(/cannot read .*missing\.json/);
    writeFileSync(join(folder, "bad.json"), "{");
    expect(() => readJson(join(folder, "bad.json"))).toThrow(/bad\.json is not valid JSON/);
  });
});

describe("findUp", () => {
  it("finds the nearest match above a folder or a file", () => {
    mkdirSync(join(folder, "a", "b"), { recursive: true });
    writeFileSync(join(folder, "marker"), "");
    writeFileSync(join(folder, "a", "b", "file.txt"), "");
    expect(findUp("marker", join(folder, "a", "b"))).toBe(join(folder, "marker"));
    expect(findUp("marker", join(folder, "a", "b", "file.txt"))).toBe(join(folder, "marker"));
  });

  it("returns undefined when nothing matches", () => {
    expect(findUp("no-such-file-anywhere-cli-kit", folder)).toBeUndefined();
  });
});

describe("readPackageVersion", () => {
  it("reads the nearest package.json's version", () => {
    mkdirSync(join(folder, "src"));
    writeFileSync(join(folder, "package.json"), '{ "version": "0.3.1" }');
    expect(readPackageVersion(join(folder, "src"))).toBe("0.3.1");
  });

  it("fails when the version is missing", () => {
    writeFileSync(join(folder, "package.json"), "{}");
    expect(() => readPackageVersion(folder)).toThrow(/has no version/);
  });
});
