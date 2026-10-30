/**
 * Tests for the format helpers.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { formatBytes, formatCount, formatDuration, formatRelativeTime, plural } from "../src/format.ts";

describe("formatDuration", () => {
  it.each([
    [0, "0 ms"],
    [850, "850 ms"],
    [1234, "1.2 s"],
    [9_960, "10 s"],
    [12_400, "12 s"],
    [184_000, "3 min 4 s"],
    [3_600_000, "1 h"],
    [7_500_000, "2 h 5 min"],
    [97_200_000, "1 d 3 h"],
    [-1500, "1.5 s"]
  ])("%d ms → %s", (milliseconds, text) => {
    expect(formatDuration(milliseconds)).toBe(text);
  });

  it("follows the locale's decimal separator", () => {
    expect(formatDuration(1234, "it")).toBe("1,2 s");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1234, "1.2 kB"],
    [34_000_000, "34 MB"],
    [5_500_000_000, "5.5 GB"],
    [-2048, "-2 kB"]
  ])("%d → %s", (bytes, text) => {
    expect(formatBytes(bytes)).toBe(text);
  });
});

describe("formatCount", () => {
  it("groups digits, or compacts", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatCount(1234567, { compact: true })).toBe("1.2M");
    expect(formatCount(1234567, {}, "it")).toBe("1.234.567");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 9, 24, 12, 0, 0);

  it.each([
    [now, "now"],
    [now - 30_000, "30 seconds ago"],
    [now - 5 * 60_000, "5 minutes ago"],
    [now + 2 * 86_400_000, "in 2 days"],
    [now - 86_400_000, "yesterday"],
    [now - 400 * 86_400_000, "last year"]
  ])("%d → %s", (moment, text) => {
    expect(formatRelativeTime(moment, now)).toBe(text);
  });

  it("accepts dates", () => {
    expect(formatRelativeTime(new Date(now - 3_600_000), new Date(now))).toBe("1 hour ago");
  });
});

describe("plural", () => {
  it("picks the noun by count", () => {
    expect(plural(1, "file")).toBe("1 file");
    expect(plural(3, "file")).toBe("3 files");
    expect(plural(0, "file")).toBe("0 files");
    expect(plural(2, "child", "children")).toBe("2 children");
    expect(plural(1200, "row")).toBe("1,200 rows");
  });
});
