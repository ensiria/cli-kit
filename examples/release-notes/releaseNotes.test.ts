/**
 * Tests for the `release-notes` example: `git log` read, commits read as conventional commits, the notes written, and
 * a changelog's section added or replaced.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  changeOf,
  FIELD_SEPARATOR,
  parseLog,
  RECORD_SEPARATOR,
  releaseNotes,
  withNotes
} from "./releaseNotes.ts";

/** A `git log` output: a feature with a scope, a breaking fix (by its footer), a message that is no conventional one. */
const LOG = [
  ["aaaaaaa1", "feat(cli): add --json", ""],
  ["bbbbbbb2", "fix: read the store once", "BREAKING CHANGE: the store moves"],
  ["ccccccc3", "Merge branch 'develop'", ""]
]
  .map((fields) => fields.join(FIELD_SEPARATOR))
  .join(`${RECORD_SEPARATOR}\n`);

describe("release notes", () => {
  it("reads git log and each commit as a conventional commit", () => {
    expect(parseLog(LOG).map(changeOf)).toEqual([
      { hash: "aaaaaaa", kind: "feature", type: "feat", scope: "cli", description: "add --json" },
      {
        hash: "bbbbbbb",
        kind: "breaking",
        type: "fix",
        scope: undefined,
        description: "read the store once"
      },
      { hash: "ccccccc", kind: "other", type: "", scope: undefined, description: "Merge branch 'develop'" }
    ]);
    expect(changeOf({ hash: "d", subject: "refactor!: rename", body: "" }).kind).toBe("breaking");
  });

  it("writes a summary table, then each kind's changes", () => {
    expect(releaseNotes("0.2.0", parseLog(LOG).map(changeOf))).toBe(
      [
        "## 0.2.0",
        "",
        "| Kind | Changes |",
        "|---|---:|",
        "| Breaking changes | 1 |",
        "| Features | 1 |",
        "| Other changes | 1 |",
        "",
        "### Breaking changes",
        "",
        "- read the store once (`bbbbbbb`)",
        "",
        "### Features",
        "",
        "- **cli**: add --json (`aaaaaaa`)",
        "",
        "### Other changes",
        "",
        "- Merge branch 'develop' (`ccccccc`)",
        ""
      ].join("\n")
    );
    expect(releaseNotes("0.2.0", [])).toBe("## 0.2.0\n\nNo changes.\n");
  });

  it("adds the notes under a changelog's title, and replaces them when the release is there", () => {
    const first = withNotes("", "Unreleased", releaseNotes("Unreleased", []));
    expect(first).toBe("# Changelog\n\n## Unreleased\n\nNo changes.\n");
    const kept = withNotes(`${first}\n## 0.1.0\n\nOld.\n`, "Unreleased", "## Unreleased\n\nNew.\n");
    expect(kept).toBe("# Changelog\n\n## Unreleased\n\nNew.\n\n## 0.1.0\n\nOld.\n");
  });
});
