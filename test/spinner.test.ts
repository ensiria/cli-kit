/**
 * Tests for the spinner, on a terminal and in a pipe.
 *
 * @module
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createExitHooks } from "../src/exit.ts";
import { createLogger } from "../src/log.ts";
import { spinner } from "../src/spinner.ts";
import { createTestIo } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

const setup = (tty: boolean) => {
  const test = createTestIo({ tty });
  const hooks = createExitHooks();
  const log = createLogger({ stdout: test.io.stdout, stderr: test.io.stderr });
  return { test, hooks, target: { io: test.io, log, onExit: hooks.add } };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("spinner on a terminal", () => {
  it("turns the waves on stderr, then prints one result line on stdout", () => {
    const { test, target } = setup(true);
    const spin = spinner("Building", target);
    vi.advanceTimersByTime(300 * 2);
    spin.update("Building icons");
    spin.succeed();
    const frames = stripAnsi(test.stderr());
    expect(frames).toContain("· Building");
    expect(frames).toContain("• Building");
    expect(frames).toContain("◉ Building");
    expect(frames).toContain("◉ Building icons");
    expect(test.stderr().endsWith("\u001B[?25h")).toBe(true);
    expect(test.stdout()).toBe("✓ Building icons\n");
  });

  it("ends with an error or a warning line, or nothing", () => {
    const failing = setup(true);
    spinner("Fetching", failing.target).fail("Fetch failed");
    expect(failing.test.stderr()).toContain("✗ Fetch failed\n");
    const warning = setup(true);
    spinner("Fetching", warning.target).warn();
    expect(warning.test.stderr()).toContain("! Fetching\n");
    const stopped = setup(true);
    spinner("Fetching", stopped.target).stop();
    expect(stopped.test.stdout()).toBe("");
  });

  it("stops turning once ended, and ignores a second end", () => {
    const { test, target } = setup(true);
    const spin = spinner("Building", target);
    spin.succeed("Done");
    const after = test.stderr();
    vi.advanceTimersByTime(3000);
    spin.fail("again");
    expect(test.stderr()).toBe(after);
    expect(test.stdout()).toBe("✓ Done\n");
  });

  it("clears itself when the run's cleanups run (Ctrl+C)", async () => {
    const { test, target, hooks } = setup(true);
    spinner("Building", target);
    await hooks.runAll();
    expect(test.stderr().endsWith("\u001B[?25h")).toBe(true);
  });
});

describe("spinner in a pipe", () => {
  it("prints a step line and the result, no frames", () => {
    const { test, target } = setup(false);
    const spin = spinner("Building", target);
    vi.advanceTimersByTime(3000);
    spin.succeed("Built");
    expect(test.stdout()).toBe("→ Building\n✓ Built\n");
    expect(test.stderr()).toBe("");
  });
});
