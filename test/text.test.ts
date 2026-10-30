/**
 * Tests for the text helpers: width, padding, truncation, wrapping, indentation and links.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  indent,
  link,
  middleTruncate,
  pad,
  stripAnsi,
  supportsLinks,
  truncate,
  width,
  wrap
} from "../src/text.ts";

describe("width", () => {
  it("counts display columns", () => {
    expect(width("abc")).toBe(3);
    expect(width("日本")).toBe(4);
    expect(width("👍")).toBe(2);
    expect(width("👍🏽")).toBe(2);
    expect(width("🇮🇹")).toBe(2);
    expect(width("é")).toBe(1);
    expect(width("©")).toBe(1);
  });

  it("ignores escape codes and measures the widest line", () => {
    expect(width("\u001B[32mok\u001B[39m")).toBe(2);
    expect(width("a\nabcd\nab")).toBe(4);
    expect(width("")).toBe(0);
  });
});

describe("pad", () => {
  it("aligns by display width", () => {
    expect(pad("ab", 4)).toBe("ab  ");
    expect(pad("ab", 4, "right")).toBe("  ab");
    expect(pad("ab", 5, "center")).toBe(" ab  ");
    expect(pad("日", 4)).toBe("日  ");
    expect(pad("\u001B[1mab\u001B[22m", 3)).toBe("\u001B[1mab\u001B[22m ");
    expect(pad("long", 2)).toBe("long");
  });
});

describe("truncate", () => {
  it("cuts at the end with an ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
    expect(truncate("hello world", 8, { unicode: false })).toBe("hello...");
    expect(truncate("short", 8)).toBe("short");
    expect(truncate("日本語テキスト", 7)).toBe("日本語…");
  });
});

describe("middleTruncate", () => {
  it("keeps the last path segment and shrinks the head", () => {
    const path = "packages/design-system/tools/build-order.mts";
    const cut = middleTruncate(path, 30);
    expect(cut).toBe("packages/desi…/build-order.mts");
    expect(width(cut)).toBeLessThanOrEqual(30);
  });

  it("keeps half when the segment is too long, or the asked tail", () => {
    expect(middleTruncate("abcdefghijklmnopqrstuvwxyz", 11)).toBe("abcde…vwxyz");
    expect(middleTruncate("abcdefghijklmnopqrstuvwxyz", 11, { tail: 3 })).toBe("abcdefg…xyz");
    expect(middleTruncate("short", 10)).toBe("short");
  });
});

describe("wrap", () => {
  it("wraps at spaces and keeps line breaks", () => {
    expect(wrap("the quick brown fox jumps", 10)).toBe("the quick\nbrown fox\njumps");
    expect(wrap("one\ntwo three", 5)).toBe("one\ntwo\nthree");
  });

  it("breaks words longer than the width", () => {
    expect(wrap("abcdefghij xy", 4)).toBe("abcd\nefgh\nij\nxy");
  });

  it("never loops on a wide character in a narrow width", () => {
    expect(wrap("日本", 1)).toBe("日\n本");
  });
});

describe("indent", () => {
  it("indents non-empty lines", () => {
    expect(indent("a\n\nb")).toBe("  a\n\n  b");
    expect(indent("a", "> ")).toBe("> a");
  });
});

describe("links", () => {
  const tty = { isTTY: true, write: (): boolean => true };

  it("writes OSC 8 when enabled, the URL in parentheses otherwise", () => {
    expect(link("docs", "https://x.dev", true)).toBe("\u001B]8;;https://x.dev\u0007docs\u001B]8;;\u0007");
    expect(stripAnsi(link("docs", "https://x.dev", true))).toBe("docs");
    expect(link("docs", "https://x.dev", false)).toBe("docs (https://x.dev)");
    expect(link("https://x.dev", "https://x.dev", false)).toBe("https://x.dev");
  });

  it("detects terminals that show links", () => {
    expect(supportsLinks(tty, { TERM_PROGRAM: "iTerm.app" })).toBe(true);
    expect(supportsLinks(tty, { TERM_PROGRAM: "Apple_Terminal" })).toBe(false);
    expect(supportsLinks(tty, { VTE_VERSION: "6003" })).toBe(true);
    expect(supportsLinks({ ...tty, isTTY: false }, { TERM_PROGRAM: "iTerm.app" })).toBe(false);
    expect(supportsLinks(tty, { TERM_PROGRAM: "iTerm.app", CI: "1" })).toBe(false);
    expect(supportsLinks({ ...tty, isTTY: false }, { FORCE_HYPERLINK: "1" })).toBe(true);
    expect(supportsLinks(tty, { TERM_PROGRAM: "iTerm.app", FORCE_HYPERLINK: "0" })).toBe(false);
  });
});
