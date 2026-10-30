/**
 * Values that come from elsewhere than the command line, for the options and positionals declared with `valueFrom`:
 * `-` is what is piped into stdin, `@path` the text of that file, `@@text` the text `@text`.
 *
 * @remarks
 * Read before `run` and before the schemas, so a schema checks what was read. stdin is read once: a second `-` in the
 * same command line is a usage error, as is `-` when stdin is a terminal (nothing piped in, it would wait for typing)
 * and a file that cannot be read.
 *
 * @module
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ArgumentError } from "./args.ts";
import type { ScriptOption, ScriptPositional } from "./help.types.ts";
import type { ScriptIo } from "./io.types.ts";

/** Where a value comes from: what the user wrote, read as `valueFrom` reads it. */
type ValueSource =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "stdin" }
  | { readonly kind: "file"; readonly path: string };

/**
 * Where a written value comes from: `-` stdin, `@path` a file, `@@text` the text `@text`, anything else itself.
 *
 * @param written - The value as written.
 */
export const valueSource = (written: string): ValueSource => {
  if (written === "-") return { kind: "stdin" };
  if (written.startsWith("@@")) return { kind: "text", text: written.slice(1) };
  if (written.startsWith("@") && written.length > 1) return { kind: "file", path: written.slice(1) };
  return { kind: "text", text: written };
};

/** Everything piped into stdin, as text. */
const readStdin = async (io: ScriptIo): Promise<string> => {
  let text = "";
  for await (const chunk of io.stdin)
    text += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  return text;
};

/**
 * The text of a file a value points at (`@path`).
 *
 * @param label - The option or argument, for the message.
 * @param path - The file, from the working folder.
 * @param cwd - The working folder.
 * @throws ArgumentError when the file is missing or cannot be read.
 */
const readFileValue = async (label: string, path: string, cwd: string): Promise<string> => {
  try {
    return await readFile(resolve(cwd, path), "utf8");
  } catch (error) {
    const isMissing = error instanceof Error && "code" in error && error.code === "ENOENT";
    throw new ArgumentError(`${label} @${path}: ${isMissing ? "no such file" : "cannot be read"}`);
  }
};

/** What reads the values of one run: stdin at most once. */
type Reader = (label: string, written: unknown) => Promise<unknown>;

/**
 * A reader for one run.
 *
 * @param io - The run's io: its stdin and its working folder.
 */
const readerFor = (io: ScriptIo): Reader => {
  let isStdinRead = false;
  const readOne = async (label: string, written: string): Promise<string> => {
    const source = valueSource(written);
    if (source.kind === "text") return source.text;
    if (source.kind === "stdin") {
      if (isStdinRead)
        throw new ArgumentError(`${label} -: stdin can be read once, and another value already did`);
      if (io.stdin.isTTY) throw new ArgumentError(`${label} -: nothing is piped into stdin`);
      isStdinRead = true;
      return readStdin(io);
    }
    return readFileValue(label, source.path, io.cwd);
  };
  return async (label: string, written: unknown): Promise<unknown> => {
    if (typeof written === "string") return readOne(label, written);
    if (Array.isArray(written)) {
      const read: unknown[] = [];
      // one after another, so a second `-` is the one refused
      for (const item of written) read.push(typeof item === "string" ? await readOne(label, item) : item);
      return read;
    }
    return written;
  };
};

/**
 * The options and positionals of a run with the values of those declared with `valueFrom` read from where they point.
 *
 * @param declaredOptions - The options.
 * @param options - Their values, by name.
 * @param declaredPositionals - The positionals.
 * @param args - Their values, by name.
 * @param io - The run's io.
 * @throws ArgumentError when stdin or a file cannot give a value.
 */
export const readValues = async (
  declaredOptions: Readonly<Record<string, ScriptOption>>,
  options: Readonly<Record<string, unknown>>,
  declaredPositionals: readonly ScriptPositional[],
  args: Readonly<Record<string, unknown>>,
  io: ScriptIo
): Promise<{
  readonly options: Readonly<Record<string, unknown>>;
  readonly args: Readonly<Record<string, unknown>>;
}> => {
  const read = readerFor(io);
  const optionValues: Record<string, unknown> = { ...options };
  for (const [name, option] of Object.entries(declaredOptions)) {
    if (option.valueFrom) optionValues[name] = await read(`--${name}`, options[name]);
  }
  const argValues: Record<string, unknown> = { ...args };
  for (const positional of declaredPositionals) {
    if (positional.valueFrom)
      argValues[positional.name] = await read(`<${positional.name}>`, args[positional.name]);
  }
  return { options: optionValues, args: argValues };
};
