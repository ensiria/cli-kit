/**
 * Tests for the cleanups and the signal handling.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { createExitHooks, listenForSignals } from "../src/exit.ts";
import { createTestIo } from "../src/testing.ts";

describe("createExitHooks", () => {
  it("runs cleanups last first, once", async () => {
    const hooks = createExitHooks();
    const calls: string[] = [];
    hooks.add(() => {
      calls.push("first");
    });
    hooks.add(async () => {
      calls.push("second");
    });
    await hooks.runAll();
    await hooks.runAll();
    expect(calls).toEqual(["second", "first"]);
  });

  it("collects errors and still runs the other cleanups", async () => {
    const hooks = createExitHooks();
    const calls: string[] = [];
    hooks.add(() => {
      calls.push("ran");
    });
    hooks.add(() => {
      throw new Error("boom");
    });
    const errors = await hooks.runAll();
    expect(calls).toEqual(["ran"]);
    expect(errors).toHaveLength(1);
  });

  it("lets a cleanup be removed", async () => {
    const hooks = createExitHooks();
    const calls: string[] = [];
    const remove = hooks.add(() => {
      calls.push("removed");
    });
    remove();
    await hooks.runAll();
    expect(calls).toEqual([]);
  });
});

describe("listenForSignals", () => {
  it("reports 130 for Ctrl+C and 143 for SIGTERM, showing the cursor on a terminal", () => {
    const test = createTestIo({ tty: true });
    const codes: number[] = [];
    const stop = listenForSignals(test.io, (code) => codes.push(code));
    test.signal("SIGINT");
    test.signal("SIGTERM");
    stop();
    test.signal("SIGINT");
    expect(codes).toEqual([130, 143]);
    expect(test.stdout()).toContain("\u001B[?25h");
  });

  it("writes nothing to a pipe", () => {
    const test = createTestIo();
    const stop = listenForSignals(test.io, () => undefined);
    test.signal("SIGINT");
    stop();
    expect(test.output()).toBe("");
  });
});
