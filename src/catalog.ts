/**
 * The script catalogue: the scripts listed in `scripts.json`, described by themselves, rendered into
 * `docs/scripts.md` (and man pages for the installed ones).
 *
 * @remarks
 * Scripts are listed explicitly so the docs never pick up experiments (D-1). Each listed script is
 * run with `CLI_KIT_DESCRIBE=1`, which makes `defineScript` print the script's JSON description and exit without
 * running its work, so nothing is imported and no side effect happens.
 *
 * @module
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { CatalogEntry, CatalogScript, GeneratedDocs } from "./catalog.types.ts";
import { ENV } from "./constants.ts";
import { formatHelpMan } from "./docs.ts";
import type { ScriptDescription } from "./docs.types.ts";
import { readJson } from "./files.ts";
import { formatHelpMarkdown } from "./help.ts";
import type { HelpSource, ScriptOption } from "./help.types.ts";
import { escapeTableCell } from "./markdown.ts";

/** The catalogue's file name, at the repo root. */
export const CATALOG_FILE = "scripts.json";

/** Where the generated reference goes, from the repo root. */
export const SCRIPTS_DOC = "docs/scripts.md";

/** Whether a value is a plain object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether every item of a value is a record with string `name` and `description`. */
const isNamedList = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (item) => isRecord(item) && typeof item["name"] === "string" && typeof item["description"] === "string"
  );

/**
 * Whether a parsed value has the shape `formatHelpJson` writes (schema 1).
 *
 * @param value - Parsed JSON.
 * @returns True for a script description.
 */
export const isScriptDescription = (value: unknown): value is ScriptDescription =>
  isRecord(value) &&
  value["schema"] === 1 &&
  typeof value["name"] === "string" &&
  typeof value["command"] === "string" &&
  typeof value["summary"] === "string" &&
  isNamedList(value["options"]) &&
  isNamedList(value["positionals"]) &&
  Array.isArray(value["examples"]);

/**
 * Reads and checks `scripts.json`: `{ "scripts": [{ "path": "…", "man"?: true }] }`.
 *
 * @param root - The repo root.
 * @returns The entries, in order.
 * @throws Error naming the problem when the file is missing or malformed.
 */
export const readCatalog = (root: string): CatalogEntry[] => {
  const json = readJson(join(root, CATALOG_FILE));
  if (!isRecord(json) || !Array.isArray(json["scripts"])) {
    throw new Error(`${CATALOG_FILE} must be { "scripts": [{ "path": "…" }] }`);
  }
  return json["scripts"].map((item: unknown, index): CatalogEntry => {
    if (!isRecord(item) || typeof item["path"] !== "string") {
      throw new Error(`${CATALOG_FILE}: scripts[${index}] needs a "path"`);
    }
    return { path: item["path"], man: item["man"] === true };
  });
};

/**
 * Asks a script for its description: runs it with `CLI_KIT_DESCRIBE=1`.
 *
 * @param root - The repo root.
 * @param entry - The listed script.
 * @param env - The environment to run it with.
 * @returns The description.
 * @throws Error when the file is missing or does not print a description (it is not built on the kit).
 */
export const describeScript = (
  root: string,
  entry: CatalogEntry,
  env: Readonly<Record<string, string | undefined>>
): ScriptDescription => {
  const file = join(root, entry.path);
  if (!existsSync(file)) throw new Error(`${entry.path} is listed in ${CATALOG_FILE} but does not exist`);
  const output = execFileSync(process.execPath, [file], {
    cwd: root,
    encoding: "utf8",
    env: { ...env, [ENV.describe]: "1", NO_COLOR: "1" }
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`${entry.path} did not describe itself: is it built on @ensiria/cli-kit's defineScript?`);
  }
  if (!isScriptDescription(parsed)) {
    throw new Error(`${entry.path} printed something that is not a script description`);
  }
  return parsed;
};

/**
 * Options as declarations, from their descriptions.
 *
 * @param options - The described options.
 */
const optionsFromDescriptions = (
  options: ScriptDescription["options"]
): Readonly<Record<string, ScriptOption>> =>
  Object.fromEntries(
    options.map((option): [string, ScriptOption] => [
      option.name,
      {
        type: option.type,
        description: option.description,
        short: option.short ?? undefined,
        valueName: option.valueName ?? undefined,
        multiple: option.multiple,
        default: option.default ?? undefined,
        min: option.min ?? undefined,
        max: option.max ?? undefined,
        integer: option.integer ?? undefined,
        choices: option.choices ?? undefined,
        env: option.env ?? undefined,
        required: option.required,
        value: option.value ?? undefined,
        impliedValue: option.impliedValue ?? undefined
      }
    ])
  );

/**
 * Turns a description back into the source the help formats take.
 *
 * @param description - A script's JSON description.
 * @returns The equivalent help source.
 */
export const sourceFromDescription = (description: ScriptDescription): HelpSource => ({
  name: description.name,
  command: description.command,
  summary: description.summary,
  description: description.description ?? undefined,
  version: description.version ?? undefined,
  options: optionsFromDescriptions(description.options),
  positionals: description.positionals.map((positional) => ({
    name: positional.name,
    description: positional.description,
    required: positional.required,
    variadic: positional.variadic,
    choices: positional.choices ?? undefined
  })),
  examples: description.examples,
  // a description written before commands existed has none of these
  inherited: optionsFromDescriptions(description.inheritedOptions ?? []),
  commands: (description.commands ?? []).map(sourceFromDescription),
  aliases: description.aliases ?? {}
});

/**
 * The reference page of every listed script.
 *
 * @param scripts - The listed scripts with their descriptions.
 * @returns `docs/scripts.md`.
 */
export const formatScriptsMarkdown = (scripts: readonly CatalogScript[]): string => {
  const lines = [
    "# Scripts",
    "",
    `<!-- Generated by \`cli-kit docs\` from \`${CATALOG_FILE}\`: do not edit by hand. -->`,
    "",
    `Every script built on \`@ensiria/cli-kit\` and listed in \`${CATALOG_FILE}\`, as its \`--help\` describes it.`,
    "",
    "| Script | What it does | File |",
    "|---|---|---|",
    ...scripts.map(
      ({ entry, description }) =>
        `| [\`${description.name}\`](#${description.name}) | ${escapeTableCell(description.summary)} | \`${entry.path}\` |`
    ),
    ""
  ];
  for (const { entry, description } of scripts) {
    lines.push(
      formatHelpMarkdown(sourceFromDescription(description)).replace(/\n$/, ""),
      "",
      `File: \`${entry.path}\``,
      ""
    );
  }
  return lines.join("\n");
};

/**
 * Every file `cli-kit docs` writes: `docs/scripts.md`, plus `docs/man/<name>.1` for entries with `man`.
 *
 * @param scripts - The listed scripts with their descriptions.
 * @returns The files by path from the repo root.
 */
export const generateDocs = (scripts: readonly CatalogScript[]): GeneratedDocs => {
  const files = new Map<string, string>([[SCRIPTS_DOC, formatScriptsMarkdown(scripts)]]);
  for (const { entry, description } of scripts) {
    if (entry.man)
      files.set(`docs/man/${description.name}.1`, formatHelpMan(sourceFromDescription(description)));
  }
  return files;
};
