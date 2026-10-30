/**
 * Files a script generates (a reference page, a changelog, a manifest): written only when their content changed, or,
 * in a check (`--check`, for CI), compared without writing and failed when out of date, with the command that brings
 * them up to date.
 *
 * @remarks
 * Every generator does the same: run with `--check` in CI, plain on a developer's machine. Writing only on a change
 * keeps the file's date (and the build tools that watch it) quiet.
 *
 * @module
 */
import { relative } from "node:path";

import { readFileSafe, writeIfChanged } from "./files.ts";
import type { GeneratedFileOptions, GeneratedFileResult } from "./generated.types.ts";
import { ScriptError } from "./script.ts";

/**
 * Writes a generated file when its content changed, or checks it is up to date without writing.
 *
 * @param path - The file.
 * @param content - What it must hold.
 * @param options - Whether to only check, the command that updates it (for the hint), and the folder paths are shown
 * from.
 * @returns `written` when it changed (never with `isCheck`), `unchanged` when it already held the content.
 * @throws A `ScriptError` with `isCheck` when the file is missing or out of date, its hint the command to run.
 * @example
 * ```ts
 * const result = writeGenerated("docs/scripts.md", markdown, { isCheck: options.check, command: "pnpm docs", cwd: io.cwd });
 * log.success(result === "written" ? "docs/scripts.md written" : "docs/scripts.md is up to date");
 * ```
 */
export const writeGenerated = (
  path: string,
  content: string,
  options: GeneratedFileOptions
): GeneratedFileResult => {
  const shown = options.cwd === undefined ? path : relative(options.cwd, path);
  if (!options.isCheck) return writeIfChanged(path, content) ? "written" : "unchanged";
  const current = readFileSafe(path);
  if (current === content) return "unchanged";
  throw new ScriptError(current === undefined ? `${shown} is missing` : `${shown} is not up to date`, {
    hint: `Run ${options.command}`
  });
};
