/**
 * Tests for the commit messages the release reads.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { subjectProblem } from "./commitMessages.ts";

describe("subjectProblem", () => {
  it("takes conventional subjects, with a scope or a breaking mark, and merge commits", () => {
    for (const subject of [
      "feat: subcommands",
      "fix(exec): stop the children on Ctrl+C",
      "feat!: drop Node 20",
      "chore(release): 0.1.0",
      "Merge branch 'develop'",
      "Merge pull request #12 from Ensiria/develop"
    ])
      expect(subjectProblem(subject)).toBeUndefined();
  });

  it("refuses an unknown type, a missing description, a capital scope, and a subject too long", () => {
    expect(subjectProblem("update stuff")).toMatch(/is not a conventional commit/);
    expect(subjectProblem("feature: x")).toMatch(/is not a conventional commit/);
    expect(subjectProblem("feat: ")).toMatch(/is not a conventional commit/);
    expect(subjectProblem("feat(CLI): x")).toMatch(/is not a conventional commit/);
    expect(subjectProblem(`feat: ${"x".repeat(100)}`)).toBe("is longer than 100 characters");
  });
});
