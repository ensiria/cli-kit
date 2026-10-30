/**
 * Tests for the header line.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { header } from "../src/header.ts";
import { width } from "../src/text.ts";

const style = { color: false, unicode: true, width: 80 };

describe("header", () => {
  it("shows the icon, name, version and summary", () => {
    expect(
      header({ name: "build-order", summary: "Recompute.", icon: "build", version: "0.1.0" }, style)
    ).toBe("✦ build-order 0.1.0 Recompute.");
  });

  it("defaults to the arrow, falls back to ASCII", () => {
    expect(header({ name: "x", summary: "Y." }, style)).toBe("▸ x Y.");
    expect(header({ name: "x", summary: "Y." }, { ...style, unicode: false })).toBe("> x Y.");
  });

  it("cuts the summary to the width", () => {
    const line = header({ name: "x", summary: "word ".repeat(30) }, { ...style, width: 40 });
    expect(width(line)).toBeLessThanOrEqual(40);
  });

  it("colours the icon with its tone", () => {
    expect(header({ name: "x", summary: "Y.", tone: "success" }, { ...style, color: true })).toContain(
      "\u001B[32m▸"
    );
  });
});
