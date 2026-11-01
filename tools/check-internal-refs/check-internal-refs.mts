#!/usr/bin/env node
/**
 * The `check-internal-refs` command: fails when a tracked file mentions a note that lives outside this repository (a
 * decision id, a numbered note, the private repository it came from). Run by `pnpm checks`, so by the CI too.
 *
 * @module
 */
import { readFileSync } from "node:fs";

import { exec } from "../../src/exec.ts";
import { defineScript, ScriptError } from "../../src/script.ts";

import { internalReferences } from "./internalRefs.ts";

/**
 * Files never read: those that are not text or are written by a tool, and the rule's own files, which have to spell
 * out what they look for (its patterns, its README, the commit check's tests).
 */
const SKIPPED =
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|gz)$|(^|\/)pnpm-lock\.yaml$|^tools\/check-internal-refs\/|^tools\/check-commits\/commitMessages\.test\.ts$/;

await defineScript({
  name: "check-internal-refs",
  command: "node tools/check-internal-refs/check-internal-refs.mts",
  summary: "Check no tracked file mentions a decision id, a numbered note or the private repository.",
  icon: "check",
  examples: [{ command: "check-internal-refs", description: "Every file git tracks." }],
  run: async ({ io, log }) => {
    const { stdout } = await exec("git", ["ls-files"], { io });
    const files = stdout.split("\n").filter((file) => file !== "" && !SKIPPED.test(file));
    const problems = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          internalReferences(line).map((found) => `${file}:${index + 1} ${found.kind} "${found.text}"`)
        )
    );
    for (const problem of problems) log.error(problem);
    if (problems.length > 0) {
      throw new ScriptError(`${problems.length} references to notes outside this repository`, {
        hint: "Say the reason in the comment itself: a reader of this repository cannot open those notes"
      });
    }
    log.success(`${files.length} files, none mentions a note outside this repository`);
  }
}).run();
