/**
 * The checks of the `doctor` example: the tools a JavaScript project needs and the state of the project in a folder,
 * each a function the report runs.
 *
 * @module
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { checkProgram } from "../../src/checks.ts";
import type { Check, CheckGroup } from "../../src/checks.types.ts";
import { exec } from "../../src/exec.ts";
import { findUp } from "../../src/files.ts";
import { plural } from "../../src/format.ts";
import type { ScriptIo } from "../../src/io.types.ts";

/** The oldest Node the project runs on. */
const NODE_MINIMUM = "22.18";

/**
 * Whether the folder is inside a git repository, and whether its working tree is clean.
 *
 * @param io - The script's io, whose folder is checked.
 */
const gitState = async (io: ScriptIo): Promise<Check> => {
  const inside = await exec("git", ["rev-parse", "--is-inside-work-tree"], { check: false, io });
  if (inside.stdout.trim() !== "true") {
    return {
      name: "git repository",
      status: "warn",
      detail: "not a repository",
      fix: { command: "git init" }
    };
  }
  const changed = (await exec("git", ["status", "--porcelain"], { io })).stdout.split("\n").filter(Boolean);
  return changed.length === 0
    ? { name: "git repository", status: "ok", detail: "clean" }
    : { name: "git repository", status: "warn", detail: `${plural(changed.length, "file")} changed or new` };
};

/**
 * Whether the folder has a `package.json`, and the lockfile of the package manager it uses.
 *
 * @param io - The script's io.
 */
const packageState = (io: ScriptIo): Check[] => {
  const manifest = findUp("package.json", io.cwd);
  if (manifest === undefined) {
    return [
      {
        name: "package.json",
        status: "fail",
        detail: `none in ${io.cwd} or above`,
        fix: { command: "pnpm init" }
      }
    ];
  }
  const folder = join(manifest, "..");
  const lockfiles = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock"].filter((file) =>
    existsSync(join(folder, file))
  );
  return [
    { name: "package.json", status: "ok", detail: manifest },
    lockfiles.length === 1
      ? { name: "lockfile", status: "ok", detail: lockfiles[0] ?? "" }
      : {
          name: "lockfile",
          status: "warn",
          detail: lockfiles.length === 0 ? "none" : `${lockfiles.join(", ")}: more than one package manager`,
          fix: { hint: "Keep the lockfile of the package manager the project uses" }
        }
  ];
};

/**
 * The doctor's checks, by section.
 *
 * @param io - The script's io: its folder, its environment, the programs it runs.
 */
export const doctorChecks = (io: ScriptIo): CheckGroup[] => [
  {
    title: "Tools",
    checks: [
      {
        name: "node",
        run: () =>
          checkProgram(
            { program: "node", minimum: NODE_MINIMUM, fix: { hint: "Install Node 22.18 or later" } },
            io
          )
      },
      { name: "git", run: () => checkProgram({ program: "git", minimum: "2.30" }, io) },
      {
        name: "pnpm",
        run: () =>
          checkProgram({ program: "pnpm", isRequired: false, fix: { command: "corepack enable pnpm" } }, io)
      }
    ]
  },
  {
    title: "Project",
    checks: [
      ...packageState(io).map((check) => ({ name: check.name, run: (): Check => check })),
      { name: "git repository", run: () => gitState(io) }
    ]
  },
  {
    title: "Environment",
    checks: [
      {
        name: "EDITOR",
        run: (): Check =>
          io.env["EDITOR"]
            ? { name: "EDITOR", status: "ok", detail: io.env["EDITOR"] }
            : {
                name: "EDITOR",
                status: "skip",
                detail: "not set: commands that open a file ask which editor"
              }
      }
    ]
  }
];
