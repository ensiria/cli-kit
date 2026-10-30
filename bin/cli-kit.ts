/**
 * The kit's own command: generates the scripts' reference (`docs/scripts.md`, man pages) from `scripts.json`, checks
 * it is up to date, and prints a script's completions or man page.
 *
 * @remarks
 * Built on the kit like every other script; `node packages/cli-kit/bin/cli-kit.ts --help` lists the commands.
 *
 * @module
 */
import { dirname, join } from "node:path";

import {
  CATALOG_FILE,
  describeScript,
  generateDocs,
  readCatalog,
  sourceFromDescription
} from "../src/catalog.ts";
import { formatCompletion, formatHelpMan, SHELLS } from "../src/docs.ts";
import { findUp, readFileSafe, writeIfChanged } from "../src/files.ts";
import { defineScript, ScriptError, usageError } from "../src/script.ts";

const COMMAND = "node packages/cli-kit/bin/cli-kit.ts";

await defineScript({
  name: "cli-kit",
  command: COMMAND,
  summary: "Generate and check the scripts' docs, completions and man pages.",
  description: `docs writes docs/scripts.md (and docs/man/<name>.1 for entries with "man") from ${CATALOG_FILE}; completion and man print one script's.`,
  icon: "docs",
  options: {
    check: {
      type: "boolean",
      short: "c",
      description: "docs: change nothing; fail when the generated files are out of date (CI)."
    },
    shell: { type: "string", description: "completion: the shell.", choices: SHELLS, default: "zsh" },
    as: {
      type: "string",
      valueName: "name",
      description: "completion: the command name to complete (default: the script's name)."
    },
    root: {
      type: "string",
      valueName: "dir",
      description: `The repo root (default: the nearest folder with ${CATALOG_FILE}).`
    }
  },
  positionals: [
    { name: "command", description: "What to do.", required: true, choices: ["docs", "completion", "man"] },
    { name: "script", description: "completion, man: the script's file." }
  ],
  examples: [
    {
      command: `${COMMAND} docs`,
      description: "Regenerate docs/scripts.md after changing a script's options."
    },
    { command: `${COMMAND} docs --check`, description: "Fail in CI when the docs are stale." },
    {
      command: `${COMMAND} completion bin/tool.ts --shell fish --as tool`,
      description: "Fish completions for tool."
    }
  ],
  run: ({ options, args, log, io }) => {
    const catalog = findUp(CATALOG_FILE, io.cwd);
    const root = options.root ?? (catalog ? dirname(catalog) : undefined);
    if (!root)
      throw new ScriptError(`no ${CATALOG_FILE} found above ${io.cwd}`, { hint: "Pass --root <dir>." });

    if (args.command !== "docs") {
      if (!args.script) throw usageError(`${args.command} needs the script's file`);
      const source = sourceFromDescription(describeScript(root, { path: args.script }, io.env));
      io.stdout.write(
        args.command === "man"
          ? formatHelpMan(source)
          : formatCompletion(source, options.shell, options.as ?? source.name)
      );
      return;
    }

    const entries = readCatalog(root);
    const scripts = entries.map((entry) => {
      log.debug(`describing ${entry.path}`);
      return { entry, description: describeScript(root, entry, io.env) };
    });
    const files = generateDocs(scripts);
    if (options.check) {
      const stale = [...files].filter(([path, content]) => readFileSafe(join(root, path)) !== content);
      if (stale.length > 0) {
        throw new ScriptError(`out of date: ${stale.map(([path]) => path).join(", ")}`, {
          hint: `Run ${COMMAND} docs`
        });
      }
      log.success(`docs are up to date (${scripts.length} scripts)`);
      return;
    }
    for (const [path, content] of files) {
      log.success(
        writeIfChanged(join(root, path), content) ? `${path} written` : `${path} already up to date`
      );
    }
  }
}).run();
