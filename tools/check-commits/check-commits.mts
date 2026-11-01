#!/usr/bin/env node
/**
 * The `check-commits` command: fails when a commit of a range is not a conventional commit, which the release could
 * not read, or when its message points at a note outside this repository. Run by the CI on every push and pull request.
 *
 * @module
 */
import { exec } from "../../src/exec.ts";
import { defineScript, ScriptError } from "../../src/script.ts";
import { messageProblem } from "./commitMessages.ts";

/** What git writes for a commit that does not exist: a new branch's `before`. */
const NO_COMMIT = /^0+$/;

await defineScript({
  name: "check-commits",
  command: "node tools/check-commits/check-commits.mts",
  summary:
    "Check the commits of a range are conventional commits, and mention no note outside this repository.",
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
    // each commit as hash, subject and body, split by the ASCII unit and record separators, which no message holds
    const { stdout } = await exec("git", ["log", "--format=%h%x1f%s%x1f%b%x1e", ...range], { io });
    const lines = stdout.split("\x1e").filter((record) => record.trim() !== "");
    const problems = lines.flatMap((record) => {
      const [hash = "", subject = "", body = ""] = record.trim().split("\x1f");
      const problem = messageProblem(subject, body);
      return problem === undefined ? [] : [`${hash} "${subject}" ${problem}`];
    });
    for (const problem of problems) log.error(problem);
    if (problems.length > 0) {
      throw new ScriptError(`${problems.length} of ${lines.length} commits cannot be released`, {
        hint: "Reword them before they reach main: the version and the changelog come from them, and the history is public"
      });
    }
    log.success(`${lines.length} commits, every one conventional and free of notes outside this repository`);
  }
}).run();
