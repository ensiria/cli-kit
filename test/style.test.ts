/**
 * Tests for colour support and painting by tone.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { paint, supportsColor } from "../src/style.ts";

const tty = { isTTY: true, write: (): boolean => true };
const pipe = { isTTY: false, write: (): boolean => true };

describe("supportsColor", () => {
  it("follows the terminal by default", () => {
    expect(supportsColor(tty, {})).toBe(true);
    expect(supportsColor(pipe, {})).toBe(false);
  });

  it("is off with NO_COLOR or FORCE_COLOR=0, even on a terminal", () => {
    expect(supportsColor(tty, { NO_COLOR: "1" })).toBe(false);
    expect(supportsColor(tty, { FORCE_COLOR: "0" })).toBe(false);
  });

  it("ignores an empty NO_COLOR", () => {
    expect(supportsColor(tty, { NO_COLOR: "" })).toBe(true);
  });

  it("is on with FORCE_COLOR, even in a pipe", () => {
    expect(supportsColor(pipe, { FORCE_COLOR: "1" })).toBe(true);
  });
});

describe("paint", () => {
  it("leaves the text alone without colour", () => {
    expect(paint("success", "done", false)).toBe("done");
  });

  it("wraps the text in escape codes with colour", () => {
    expect(paint("success", "done", true)).toBe("\u001B[32mdone\u001B[39m");
  });

  it("never styles neutral text", () => {
    expect(paint("neutral", "plain", true)).toBe("plain");
  });
});
