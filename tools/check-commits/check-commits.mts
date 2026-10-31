#!/usr/bin/env node
/**
 * The `check-commits` command: fails when a commit of a range is not a conventional commit, which the release could
 * not read. Run by the CI on every push and pull request.
 *
 * @module
 */
import { exec } from "../../src/exec.ts";
import { defineScript, ScriptError } from "../../src/script.ts";
import { subjectProblem } from "./commitMessages.ts";

/** What git writes for a commit that does not exist: a new branch's `before`. */
const NO_COMMIT = /^0+$/;

await defineScript({
  name: "check-commits",
  command: "node tools/check-commits/check-commits.mts",
  summary: "Check the commits of a range are conventional commits.",
  icon: "check",
  options: {
    from: {
      type: "string",
      valueName: "ref",
      description: "The commit the range starts after; none (or zeros, a new branch) checks only --to."
    },
    to: { type: "string", valueName: "ref", default: "HEAD", description: "The range's last commit." }
  },
  examples: [
    { command: "check-commits --from origin/main", description: "The commits a pull request brings to main." }
  ],
  run: async ({ options, io, log }) => {
    const range =
      options.from === undefined || NO_COMMIT.test(options.from)
        ? ["-1", options.to]
        : [`${options.from}..${options.to}`];
    const { stdout } = await exec("git", ["log", "--format=%h %s", ...range], { io });
    const lines = stdout.split("\n").filter(Boolean);
    const problems = lines.flatMap((line) => {
      const [hash = "", ...words] = line.split(" ");
      const subject = words.join(" ");
      const problem = subjectProblem(subject);
      return problem === undefined ? [] : [`${hash} "${subject}" ${problem}`];
    });
    for (const problem of problems) log.error(problem);
    if (problems.length > 0) {
      throw new ScriptError(`${problems.length} of ${lines.length} commits cannot be released`, {
        hint: "Reword them (git rebase -i) before they reach main: the version and the changelog come from them"
      });
    }
    log.success(`${lines.length} commits, every one conventional`);
  }
}).run();
