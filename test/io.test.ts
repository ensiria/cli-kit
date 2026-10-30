/**
 * Tests for the terminal questions: width, CI, interactivity.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { isCi, isInteractive, processIo, terminalWidth } from "../src/io.ts";

const stream = (
  isTTY: boolean,
  columns?: number
): { isTTY: boolean; columns?: number; write: () => boolean } => ({
  isTTY,
  ...(columns === undefined ? {} : { columns }),
  write: (): boolean => true
});

describe("terminalWidth", () => {
  it("uses the terminal's columns", () => {
    expect(terminalWidth(stream(true, 120))).toBe(120);
  });

  it("falls back to 80 for a pipe or an unknown width", () => {
    expect(terminalWidth(stream(false, 120))).toBe(80);
    expect(terminalWidth(stream(true))).toBe(80);
    expect(terminalWidth(stream(false), 100)).toBe(100);
  });

  it("never goes below 20 columns", () => {
    expect(terminalWidth(stream(true, 5))).toBe(20);
  });
});

describe("isCi", () => {
  it("reads CI", () => {
    expect(isCi({ CI: "true" })).toBe(true);
    expect(isCi({ CI: "1" })).toBe(true);
    expect(isCi({ CI: "false" })).toBe(false);
    expect(isCi({ CI: "0" })).toBe(false);
    expect(isCi({})).toBe(false);
  });
});

describe("isInteractive", () => {
  it("needs a terminal that is not dumb and not CI", () => {
    expect(isInteractive(stream(true), {})).toBe(true);
    expect(isInteractive(stream(false), {})).toBe(false);
    expect(isInteractive(stream(true), { TERM: "dumb" })).toBe(false);
    expect(isInteractive(stream(true), { CI: "true" })).toBe(false);
  });
});

describe("processIo", () => {
  it("is bound to the real process", () => {
    const io = processIo();
    expect(io.stdout).toBe(process.stdout);
    expect(io.env).toBe(process.env);
    expect(io.argv).toEqual(process.argv.slice(2));
  });
});
