/**
 * Tests for the progress bar, on a terminal and in a pipe.
 *
 * @module
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/log.ts";
import { progress, progressBar } from "../src/progress.ts";
import { createTestIo } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

const setup = (tty: boolean, quiet = false) => {
  const test = createTestIo({ tty, columns: 100 });
  const log = createLogger({ stdout: test.io.stdout, stderr: test.io.stderr, quiet });
  return { test, target: { io: test.io, log } };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("progressBar", () => {
  it("fills by fraction, in Unicode or ASCII", () => {
    expect(progressBar(0.5, 0, true)).toBe(`${"█".repeat(12)}${"░".repeat(12)}`);
    expect(progressBar(1.5, 0, false)).toBe("#".repeat(24));
    expect(progressBar(0, 0, false)).toBe("-".repeat(24));
  });

  it("moves a block back and forth when indeterminate", () => {
    expect(progressBar(undefined, 0, false)).toBe(`${"#".repeat(6)}${"-".repeat(18)}`);
    expect(progressBar(undefined, 18, false)).toBe(`${"-".repeat(18)}${"#".repeat(6)}`);
    expect(progressBar(undefined, 36, false)).toBe(progressBar(undefined, 0, false));
  });
});

describe("progress on a terminal", () => {
  it("draws count, percentage, rate and estimate, throttled", () => {
    const { test, target } = setup(true);
    const bar = progress({ label: "Icons", total: 100, unit: "files" }, target);
    vi.advanceTimersByTime(2000);
    bar.set(50);
    const drawn = stripAnsi(test.stderr());
    expect(drawn).toContain("Icons");
    expect(drawn).toContain("50/100 files 50% · 25/s · 2 s left");
    const before = test.stderr();
    bar.tick();
    expect(test.stderr()).toBe(before);
    bar.done();
    expect(test.stdout()).toBe("✓ Icons: 51 files in 2 s\n");
  });

  it("animates when the total is unknown, until a total arrives", () => {
    const { test, target } = setup(true);
    const bar = progress({ label: "Scanning" }, target);
    const start = test.stderr();
    vi.advanceTimersByTime(500);
    expect(test.stderr().length).toBeGreaterThan(start.length);
    bar.setTotal(10);
    bar.set(10);
    bar.fail("Scan failed");
    expect(test.stderr()).toContain("✗ Scan failed\n");
  });
});

describe("progress in a pipe", () => {
  it("prints a line at most every two seconds, then the result", () => {
    const { test, target } = setup(false);
    const bar = progress({ label: "Rows", total: 3 }, target);
    bar.tick();
    vi.advanceTimersByTime(2500);
    bar.tick();
    bar.tick();
    bar.done("Rows imported");
    expect(test.stdout()).toBe("› Rows 0/3 0%\n› Rows 2/3 66%\n✓ Rows imported\n");
    expect(test.stderr()).toBe("");
  });

  it("prints only the result with --quiet", () => {
    const { test, target } = setup(false, true);
    const bar = progress({ label: "Rows", total: 3 }, target);
    bar.tick(3);
    bar.fail("broke");
    expect(test.stdout()).toBe("");
    expect(test.stderr()).toBe("✗ broke\n");
  });
});
