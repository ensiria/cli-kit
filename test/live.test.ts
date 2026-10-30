/**
 * Tests for the live region, the animation rule and the timer.
 *
 * @module
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { canAnimate, createLiveRegion, startLiveRun } from "../src/live.ts";
import { createLogger } from "../src/log.ts";
import { createTestIo } from "../src/testing.ts";
import { timer } from "../src/timer.ts";

const target = (tty: boolean, env: Record<string, string> = {}, quiet = false) => {
  const test = createTestIo({ tty, env });
  return { test, io: test.io, log: createLogger({ stdout: test.io.stdout, stderr: test.io.stderr, quiet }) };
};

describe("canAnimate", () => {
  it("animates only on an interactive stderr without --quiet", () => {
    expect(canAnimate(target(true))).toBe(true);
    expect(canAnimate(target(false))).toBe(false);
    expect(canAnimate(target(true, { CI: "true" }))).toBe(false);
    expect(canAnimate(target(true, { TERM: "dumb" }))).toBe(false);
    expect(canAnimate(target(true, {}, true))).toBe(false);
  });
});

describe("createLiveRegion", () => {
  it("hides the cursor, redraws in place and clears", () => {
    const test = createTestIo({ tty: true, columns: 40 });
    const region = createLiveRegion(test.io.stderr, true);
    region.render(["one", "two"]);
    region.render(["three"]);
    region.clear();
    expect(test.stderr()).toBe(
      "\u001B[?25lone\ntwo" + "\r\u001B[2K\u001B[1A\r\u001B[2Kthree" + "\r\u001B[2K\u001B[?25h"
    );
  });

  it("cuts lines to the width so nothing wraps", () => {
    const test = createTestIo({ tty: true, columns: 20 });
    createLiveRegion(test.io.stderr, true).render(["x".repeat(50)]);
    expect(test.stderr()).toContain(`${"x".repeat(18)}…`);
  });

  it("does nothing on clear when nothing was drawn", () => {
    const test = createTestIo({ tty: true });
    createLiveRegion(test.io.stderr, true).clear();
    expect(test.stderr()).toBe("");
  });
});

describe("timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("measures and formats elapsed time, and resets", () => {
    const clock = timer();
    vi.advanceTimersByTime(1500);
    expect(clock.elapsed()).toBe(1500);
    expect(clock.format()).toBe("1.5 s");
    clock.reset();
    expect(clock.elapsed()).toBe(0);
  });
});

describe("startLiveRun", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks until the end, erases the region once and drops the Ctrl+C cleanup", () => {
    const test = createTestIo({ tty: true });
    const region = createLiveRegion(test.io.stderr, true);
    const removed = vi.fn();
    let cleanup: (() => void) | undefined;
    const onExit = (registered: () => void): (() => void) => {
      cleanup = registered;
      return removed;
    };
    const tick = vi.fn(() => region.render(["frame"]));
    const run = startLiveRun({ ...target(true), onExit }, region, { tick, everyMs: 100 });
    vi.advanceTimersByTime(250);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(run.isRunning()).toBe(true);
    run.end();
    run.end();
    vi.advanceTimersByTime(500);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(run.isRunning()).toBe(false);
    expect(removed).toHaveBeenCalledTimes(1);
    expect(cleanup).toBe(run.end);
  });

  it("stops the timer alone, still running", () => {
    const tick = vi.fn();
    const test = createTestIo({ tty: true });
    const run = startLiveRun(target(true), createLiveRegion(test.io.stderr, true), { tick, everyMs: 100 });
    run.stopTicker();
    vi.advanceTimersByTime(500);
    expect(tick).not.toHaveBeenCalled();
    expect(run.isRunning()).toBe(true);
  });
});
