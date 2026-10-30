#!/usr/bin/env node
/**
 * The `release-notes` example: the notes of a release from its conventional commits, printed or kept in a changelog.
 *
 * @remarks
 * Shows `exec` (git, its failures as the kit's errors), `writeGenerated` (a file written only when it changed, or
 * checked with `--check` in CI), `formatTable` and `codeSpan` (the notes' summary), and `--json`. The logic is in
 * `releaseNotes.ts`. `node examples/release-notes/release-notes.mts --help` shows the options.
 *
 * @module
 */
import { resolve } from "node:path";

import { exec } from "../../src/exec.ts";
import { readFileSafe } from "../../src/files.ts";
import { writeGenerated } from "../../src/generated.ts";
import { defineScript } from "../../src/script.ts";
import { changeOf, LOG_FORMAT, parseLog, releaseNotes, withNotes } from "./releaseNotes.ts";

await defineScript({
  name: "release-notes",
  command: "node examples/release-notes/release-notes.mts",
  summary: "Write a release's notes from its conventional commits.",
  icon: "docs",
  json: true,
  options: {
    from: {
      type: "string",
      valueName: "ref",
      description: "The commit the release starts after; the last tag by default."
    },
    to: { type: "string", valueName: "ref", default: "HEAD", description: "The release's last commit." },
    title: { type: "string", default: "Unreleased", description: "The release's heading." },
    write: {
      type: "string",
      valueName: "file",
      description: "Keep the notes in this changelog instead of printing them."
    },
    check: {
      type: "boolean",
      short: "c",
      description: "With --write: fail when the changelog is not up to date (CI)."
    }
  },
  examples: [
    { command: "release-notes", description: "Print the notes since the last tag." },
    {
      command: "release-notes --write CHANGELOG.md --title 0.2.0",
      description: "Keep them in the changelog."
    },
    { command: "release-notes --write CHANGELOG.md --check", description: "Check the changelog in CI." }
  ],
  run: async ({ options, io, log, isJson }) => {
    const lastTag = await exec("git", ["describe", "--tags", "--abbrev=0"], { check: false, io });
    const from = options.from ?? (lastTag.code === 0 ? lastTag.stdout.trim() : undefined);
    const range = from === undefined ? options.to : `${from}..${options.to}`;
    const { stdout } = await exec("git", ["log", `--format=${LOG_FORMAT}`, range], { io });
    const changes = parseLog(stdout).map(changeOf);
    if (isJson) return changes;
    const notes = releaseNotes(options.title, changes);
    if (options.write === undefined) {
      io.stdout.write(notes);
      return undefined;
    }
    const file = resolve(io.cwd, options.write);
    const command = `release-notes --write ${options.write} --title ${options.title}`;
    const result = writeGenerated(file, withNotes(readFileSafe(file) ?? "", options.title, notes), {
      isCheck: options.check,
      command,
      cwd: io.cwd
    });
    log.success(
      result === "written" ? `${options.write}: ${options.title} written` : `${options.write} is up to date`
    );
    return undefined;
  }
}).run();
