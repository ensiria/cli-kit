/**
 * Tests for versions read from programs' output and compared.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { compareVersions, formatVersion, isAtLeast, parseVersion } from "../src/version.ts";

describe("version", () => {
  it("reads the first version in what a program prints, a missing patch as 0", () => {
    expect(parseVersion("git version 2.39.5 (Apple Git-154)")).toEqual({ major: 2, minor: 39, patch: 5 });
    expect(parseVersion("v22.18.0")).toEqual({ major: 22, minor: 18, patch: 0 });
    expect(parseVersion("tmux 3.5")).toEqual({ major: 3, minor: 5, patch: 0 });
    expect(parseVersion("1.0.0-beta.2")).toEqual({ major: 1, minor: 0, patch: 0, prerelease: "beta.2" });
    expect(parseVersion("no version here")).toBeUndefined();
  });

  it("compares by numbers, a prerelease before its release, prereleases by their numbers", () => {
    const at = (text: string): ReturnType<typeof parseVersion> & object => {
      const version = parseVersion(text);
      if (!version) throw new Error(text);
      return version;
    };
    expect(compareVersions(at("2.39.5"), at("2.4.0"))).toBeGreaterThan(0);
    expect(compareVersions(at("1.0.0-beta"), at("1.0.0"))).toBeLessThan(0);
    expect(compareVersions(at("1.0.0-beta.10"), at("1.0.0-beta.2"))).toBeGreaterThan(0);
    expect(compareVersions(at("3.5"), at("3.5.0"))).toBe(0);
  });

  it("says whether a version is a minimum or later, and writes one back", () => {
    expect(isAtLeast("v22.18.0", "22.18")).toBe(true);
    expect(isAtLeast("22.17.1", "22.18")).toBe(false);
    expect(isAtLeast("unknown", "1.0")).toBeUndefined();
    expect(formatVersion({ major: 1, minor: 2, patch: 3, prerelease: "rc.1" })).toBe("1.2.3-rc.1");
  });
});
