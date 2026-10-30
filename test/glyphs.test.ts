/**
 * Tests for the glyphs: Unicode and ASCII forms and when each is used.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { GLYPHS, SPINNER, SYMBOLS } from "../src/constants.ts";
import { glyph, pick, supportsUnicode } from "../src/glyphs.ts";

describe("supportsUnicode", () => {
  it("is on by default", () => {
    expect(supportsUnicode({})).toBe(true);
  });

  it("is off with CLI_KIT_ASCII=1 or TERM=dumb", () => {
    expect(supportsUnicode({ CLI_KIT_ASCII: "1" })).toBe(false);
    expect(supportsUnicode({ TERM: "dumb" })).toBe(false);
  });
});

describe("glyph", () => {
  it("returns the Unicode or the ASCII form", () => {
    expect(glyph("success", true)).toBe("✓");
    expect(glyph("success", false)).toBe("+");
  });

  it("has an ASCII form for every glyph", () => {
    for (const pair of Object.values(GLYPHS)) {
      expect(pair.ascii).toMatch(/^[\x20-\x7e]+$/);
    }
  });
});

describe("pick", () => {
  it("chooses between the two forms of any pair", () => {
    expect(pick(SYMBOLS.ellipsis, true)).toBe("…");
    expect(pick(SYMBOLS.ellipsis, false)).toBe("...");
  });

  it("keeps the spinner's two frame lists the same length", () => {
    expect(SPINNER.unicode).toHaveLength(SPINNER.ascii.length);
  });
});
