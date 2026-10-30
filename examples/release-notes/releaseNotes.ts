/**
 * The logic of the `release-notes` example: `git log` read, each commit read as a conventional commit, and the notes
 * of a release written as Markdown, a summary table and a list per kind, into a changelog's section. Pure.
 *
 * @module
 */
import { codeSpan, formatTable, readSection, replaceSection } from "../../src/markdown.ts";
import type { Change, ChangeKind, LoggedCommit } from "./releaseNotes.types.ts";

/** Between two commits, in the `git log` format the command asks for: no message holds it. */
export const RECORD_SEPARATOR = "\u001e";

/** Between a commit's fields, in the same format. */
export const FIELD_SEPARATOR = "\u001f";

/** The `--format` of `git log` that `parseLog` reads: hash, subject and body, separated so no message can clash. */
export const LOG_FORMAT = `%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b${RECORD_SEPARATOR}`;

/** The kinds in the notes' order, with their headings. */
const KINDS: readonly (readonly [ChangeKind, string])[] = [
  ["breaking", "Breaking changes"],
  ["feature", "Features"],
  ["fix", "Fixes"],
  ["other", "Other changes"]
];

/** The kind of the commit types the notes list apart; any other type is an `other` change. */
const KIND_OF_TYPE: Readonly<Record<string, ChangeKind>> = { feat: "feature", fix: "fix" };

/** A conventional commit's subject: its type, its scope, a `!` for a breaking change, its description. */
const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;

/**
 * The commits of a `git log --format=LOG_FORMAT` output.
 *
 * @param output - What git printed.
 */
export const parseLog = (output: string): LoggedCommit[] =>
  output
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = "", subject = "", body = ""] = record.split(FIELD_SEPARATOR);
      return { hash, subject: subject.trim(), body: body.trim() };
    });

/**
 * A commit read as a conventional commit; a message that is not one is an `other` change, its subject the
 * description.
 *
 * @param commit - The commit.
 */
export const changeOf = (commit: LoggedCommit): Change => {
  const hash = commit.hash.slice(0, 7);
  const match = CONVENTIONAL.exec(commit.subject);
  if (!match) return { hash, kind: "other", type: "", scope: undefined, description: commit.subject };
  const [, type = "", scope, bang, description = ""] = match;
  const isBreaking = bang === "!" || /^BREAKING[ -]CHANGE:/m.test(commit.body);
  return { hash, kind: isBreaking ? "breaking" : (KIND_OF_TYPE[type] ?? "other"), type, scope, description };
};

/**
 * The notes of a release: its heading, a table of how many changes of each kind, then each kind's changes.
 *
 * @param title - The release's heading (`Unreleased`, `0.2.0`).
 * @param changes - Its changes, newest first.
 * @returns The Markdown, from the `## ` heading, ending with a newline.
 */
export const releaseNotes = (title: string, changes: readonly Change[]): string => {
  const present = KINDS.filter(([kind]) => changes.some((change) => change.kind === kind));
  if (present.length === 0) return `## ${title}\n\nNo changes.\n`;
  const summary = formatTable(
    [
      { key: "kind", title: "Kind" },
      { key: "count", title: "Changes", align: "right" }
    ],
    present.map(([kind, heading]) => ({
      kind: heading,
      count: changes.filter((change) => change.kind === kind).length
    }))
  );
  const lists = present.flatMap(([kind, heading]) => [
    `### ${heading}`,
    "",
    ...changes
      .filter((change) => change.kind === kind)
      .map((change) => {
        const scope = change.scope === undefined ? "" : `**${change.scope}**: `;
        return `- ${scope}${change.description} (${codeSpan(change.hash).markdown})`;
      }),
    ""
  ]);
  return [`## ${title}`, "", summary, "", ...lists].join("\n");
};

/**
 * A changelog with a release's notes in it: its section replaced when it has one, added under the changelog's title
 * otherwise.
 *
 * @param changelog - The changelog as it is; empty for a new one.
 * @param title - The release's heading.
 * @param notes - Its notes, from `releaseNotes`.
 */
export const withNotes = (changelog: string, title: string, notes: string): string => {
  const heading = `## ${title}`;
  const body = notes.slice(heading.length + 1).replace(/^\n/, "");
  if (readSection(changelog, heading) !== undefined) return replaceSection(changelog, heading, body);
  const top = changelog.startsWith("# ") ? changelog.slice(0, changelog.indexOf("\n") + 1) : "# Changelog\n";
  const rest = changelog.startsWith("# ") ? changelog.slice(top.length).replace(/^\n+/, "") : changelog;
  return `${top}\n${notes}${rest === "" ? "" : `\n${rest}`}`;
};
