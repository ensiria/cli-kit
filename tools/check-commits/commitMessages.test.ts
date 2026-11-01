/**
 * Tests for the commit messages the release reads.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { messageProblem, subjectProblem } from "./commitMessages.ts";

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

describe("messageProblem", () => {
  it("refuses a message that points at notes outside this repository, in its subject or its body", () => {
    expect(messageProblem("fix(prompt): the select keeps its choice (D-469)", "")).toBe(
      'mentions a note outside this repository: decision id "(D-469)"'
    );
    expect(
      messageProblem("fix(prompt): the select keeps its choice", "As note 142 says, moved from dev-tooling.")
    ).toBe(
      'mentions a note outside this repository: numbered note "note 142", private repository "dev-tooling"'
    );
  });

  it("reads the subject first, and lets a clean message through", () => {
    expect(messageProblem("wip", "")).toMatch(/^is not a conventional commit/);
    expect(
      messageProblem(
        "fix(prompt): the select keeps its choice keeps its height",
        "Said in the comment itself."
      )
    ).toBe(undefined);
  });
});
