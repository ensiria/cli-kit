/**
 * Tests for the logger: streams, quiet / verbose / json, glyphs and colour.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { createLogger } from "../src/log.ts";
import type { LoggerOptions } from "../src/log.types.ts";
import { createTestIo } from "../src/testing.ts";

const setup = (
  options: Partial<LoggerOptions> = {}
): ReturnType<typeof createTestIo> & {
  log: ReturnType<typeof createLogger>;
} => {
  const test = createTestIo();
  return { ...test, log: createLogger({ stdout: test.io.stdout, stderr: test.io.stderr, ...options }) };
};

describe("createLogger", () => {
  it("prints results to stdout and problems to stderr, each with its glyph", () => {
    const { log, stdout, stderr } = setup();
    log.step("reading");
    log.info("305 rows");
    log.success("done");
    log.warn("odd row");
    log.error("broken");
    log.hint("run it again");
    expect(stdout()).toBe("→ reading\n› 305 rows\n✓ done\n");
    expect(stderr()).toBe("! odd row\n✗ broken\n  run it again\n");
  });

  it("uses ASCII glyphs when Unicode is off", () => {
    const { log, stdout } = setup({ unicode: false });
    log.success("done");
    expect(stdout()).toBe("+ done\n");
  });

  it("keeps only warnings and errors when quiet", () => {
    const { log, stdout, stderr } = setup({ quiet: true });
    log.success("done");
    log.plain("table");
    log.debug("detail");
    log.warn("odd");
    expect(stdout()).toBe("");
    expect(stderr()).toBe("! odd\n");
  });

  it("prints debug lines only when verbose", () => {
    const quietDebug = setup();
    quietDebug.log.debug("detail");
    expect(quietDebug.stdout()).toBe("");
    const verbose = setup({ verbose: true });
    verbose.log.debug("detail");
    expect(verbose.stdout()).toBe("· detail\n");
  });

  it("moves every line to stderr in json mode", () => {
    const { log, stdout, stderr } = setup({ json: true });
    log.success("done");
    log.plain("table");
    expect(stdout()).toBe("");
    expect(stderr()).toBe("✓ done\ntable\n");
  });

  it("colours glyphs per stream", () => {
    const { log, stdout, stderr } = setup({ color: true, colorStderr: false });
    log.success("done");
    log.error("broken");
    expect(stdout()).toBe("\u001B[32m✓\u001B[39m done\n");
    expect(stderr()).toBe("✗ broken\n");
  });

  it("exposes the look of stdout for rendering helpers", () => {
    const { log } = setup({ color: true, unicode: false });
    expect(log.style).toEqual({ color: true, unicode: false, width: 80 });
  });
});
