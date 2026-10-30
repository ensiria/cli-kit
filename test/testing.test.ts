/**
 * Tests for the test helpers themselves.
 *
 * @module
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createTestIo, runScriptProcess } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

describe("createTestIo", () => {
  it("captures each stream and both in order", () => {
    const test = createTestIo();
    test.io.stdout.write("a");
    test.io.stderr.write("b");
    test.io.stdout.write("c");
    expect(test.stdout()).toBe("ac");
    expect(test.stderr()).toBe("b");
    expect(test.output()).toBe("abc");
  });

  it("fakes a terminal of a given width", () => {
    const test = createTestIo({ tty: true, columns: 120 });
    expect(test.io.stdout.isTTY).toBe(true);
    expect(test.io.stdout.columns).toBe(120);
    expect(test.io.stdin.isTTY).toBe(true);
    expect(createTestIo().io.stdout.isTTY).toBe(false);
  });

  it("isolates the environment", () => {
    expect(createTestIo().io.env).toEqual({});
    expect(createTestIo({ env: { CI: "1" } }).io.env).toEqual({ CI: "1" });
  });

  it("feeds stdin, now and later", async () => {
    const test = createTestIo({ input: "yes\n" });
    test.type("no\n");
    test.endInput();
    let text = "";
    for await (const chunk of test.io.stdin) text += String(chunk);
    expect(text).toBe("yes\nno\n");
  });
});

describe("stripAnsi", () => {
  it("removes escape codes", () => {
    expect(stripAnsi("\u001B[32m✓\u001B[39m done")).toBe("✓ done");
  });
});

describe("runScriptProcess", () => {
  it("runs a file as a process, colour off, with only the given environment", () => {
    const folder = mkdtempSync(join(tmpdir(), "cli-kit-process-"));
    try {
      const file = join(folder, "probe.mjs");
      writeFileSync(
        file,
        [
          "process.stdout.write(JSON.stringify([process.argv.slice(2), process.env.NO_COLOR, process.env.EXTRA, process.env.HOME]));",
          'process.stderr.write("err");',
          "process.exitCode = 3;"
        ].join("\n")
      );
      const run = runScriptProcess(file, ["--check"], { EXTRA: "x" });
      expect(run.exitCode).toBe(3);
      expect(JSON.parse(run.stdout)).toEqual([["--check"], "1", "x", null]);
      expect(run.stderr).toBe("err");
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
