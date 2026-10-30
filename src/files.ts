/**
 * Files the way scripts need them: write only when the content changed, JSON with one stable format, and find the
 * nearest file up the folder tree.
 *
 * @remarks
 * Generators report "already up to date" instead of touching a file (and its modification time) for nothing; JSON is
 * always written with two-space indentation and a final newline, so a regenerated file diffs cleanly.
 *
 * @module
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, parse, resolve } from "node:path";

/**
 * Writes a text file only when its content differs from what is on disk; creates the parent folders.
 *
 * @param path - The file.
 * @param content - The full new content.
 * @returns True when the file was written (new or changed), false when it already had this content.
 * @example
 * ```ts
 * const changed = writeIfChanged(FILE, next);
 * log.success(changed ? "BUILD-ORDER.md recomputed" : "BUILD-ORDER.md already up to date");
 * ```
 */
export const writeIfChanged = (path: string, content: string): boolean => {
  if (existsSync(path) && readFileSync(path, "utf8") === content) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return true;
};

/**
 * Reads a text file, or undefined when it does not exist (for comparing generated files).
 *
 * @param path - The file.
 * @returns Its content, or undefined.
 */
export const readFileSafe = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, "utf8") : undefined;

/**
 * Reads and parses a JSON file.
 *
 * @param path - The file.
 * @returns The parsed value, `unknown` until the caller validates it.
 * @throws Error naming the file when it is missing or not valid JSON.
 */
export const readJson = (path: string): unknown => {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * The stable text form of a JSON value: two-space indentation and a final newline.
 *
 * @param value - Anything `JSON.stringify` accepts.
 * @returns The text.
 */
export const formatJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Writes a JSON file in the stable format, only when it changed.
 *
 * @param path - The file.
 * @param value - The value.
 * @returns True when the file was written.
 */
export const writeJson = (path: string, value: unknown): boolean => writeIfChanged(path, formatJson(value));

/**
 * Finds the nearest file or folder with a name, from a folder up to the root.
 *
 * @param name - The file or folder name (`package.json`, `pnpm-workspace.yaml`, `.git`).
 * @param from - Where to start; a file path starts from its folder.
 * @returns The absolute path found, or undefined.
 * @example
 * ```ts
 * const root = dirname(findUp("pnpm-workspace.yaml", import.meta.dirname) ?? ".");
 * ```
 */
export const findUp = (name: string, from: string): string | undefined => {
  let folder = resolve(from);
  if (existsSync(folder) && statSync(folder).isFile()) folder = dirname(folder);
  const { root } = parse(folder);
  for (;;) {
    const candidate = join(folder, name);
    if (existsSync(candidate)) return candidate;
    if (folder === root) return undefined;
    folder = dirname(folder);
  }
};

/**
 * The `version` of the nearest `package.json` above a file, for a script's `--version`.
 *
 * @param from - A path inside the package (usually `import.meta.dirname`).
 * @returns The version.
 * @throws Error when no `package.json` with a string `version` is found.
 */
export const readPackageVersion = (from: string): string => {
  const path = findUp("package.json", from);
  if (!path) throw new Error(`no package.json above ${from}`);
  const json = readJson(path);
  const version = typeof json === "object" && json !== null && "version" in json ? json.version : undefined;
  if (typeof version !== "string") throw new Error(`${path} has no version`);
  return version;
};
