/**
 * Versions as programs print them: the first `major.minor[.patch][-prerelease]` in a text (`git version 2.39.5`,
 * `v22.18.0`, `pnpm 10.19.0`), compared by their numbers, a prerelease before its release.
 *
 * @remarks
 * For the checks of a doctor command and the scripts that need a tool at a minimum version; not a full semver range
 * parser (no `^` or `~`). Pure.
 *
 * @module
 */
import type { Version } from "./version.types.ts";

/** The first version in a text: numbers joined by dots, an optional `v` before, an optional prerelease after. */
const VERSION_PATTERN = /(?<![\d.])v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/;

/**
 * The first version a text holds.
 *
 * @param text - What a program printed (`git version 2.39.5 (Apple Git-154)`), or a version (`22.18`).
 * @returns The version, a missing patch read as 0; undefined when the text holds none.
 */
export const parseVersion = (text: string): Version | undefined => {
  const match = VERSION_PATTERN.exec(text);
  if (!match) return undefined;
  const [, major = "0", minor = "0", patch = "0", prerelease] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    ...(prerelease === undefined ? {} : { prerelease })
  };
};

/**
 * Compares two versions: by major, minor and patch, then a prerelease before the release.
 *
 * @param left - One version.
 * @param right - The other.
 * @returns A negative number when `left` is older, positive when newer, 0 when the same.
 */
export const compareVersions = (left: Version, right: Version): number => {
  const byNumbers = left.major - right.major || left.minor - right.minor || left.patch - right.patch;
  if (byNumbers !== 0) return byNumbers;
  if (left.prerelease === right.prerelease) return 0;
  if (left.prerelease === undefined) return 1;
  if (right.prerelease === undefined) return -1;
  return left.prerelease.localeCompare(right.prerelease, "en", { numeric: true });
};

/**
 * Whether a version is a minimum or later.
 *
 * @param version - The version, or the text that holds it.
 * @param minimum - The minimum (`22.18`).
 * @returns Whether it is at least the minimum; undefined when either holds no version.
 */
export const isAtLeast = (version: string, minimum: string): boolean | undefined => {
  const found = parseVersion(version);
  const least = parseVersion(minimum);
  return found && least ? compareVersions(found, least) >= 0 : undefined;
};

/**
 * A version as text: `2.39.5`, `1.0.0-beta.2`.
 *
 * @param version - The version.
 */
export const formatVersion = (version: Version): string =>
  `${version.major}.${version.minor}.${version.patch}${version.prerelease ? `-${version.prerelease}` : ""}`;
