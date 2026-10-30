/**
 * The command line read against a script's declarations: the options and positionals checked at definition time, the
 * arguments parsed (`util.parseArgs`), each option's value from the command line, its environment variable or its
 * default, and the positionals by name. Shared by `defineScript` and `defineCommands`.
 *
 * @remarks
 * Every problem with what the user typed is a usage error (`EXIT.usage`); a problem with the declarations themselves
 * throws a plain `Error` when the script is defined, so it shows up in the first run of its tests.
 *
 * @module
 */
import { parseArgs } from "node:util";

import type { ScriptOption, ScriptPositional } from "./help.types.ts";
import type { ScriptIo } from "./io.types.ts";

/**
 * A command line that does not match the declarations: the runner reports it as a usage error (`EXIT.usage`), with the
 * same message.
 */
export class ArgumentError extends Error {
  /**
   * @param message - What was wrong with the command line.
   */
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

/** Values an environment variable may hold for a boolean option. */
const ENV_BOOLEANS: Readonly<Record<string, boolean>> = {
  "1": true,
  true: true,
  yes: true,
  "0": false,
  false: false,
  no: false,
  "": false
};

/** Reads a parsed value as a boolean (parseArgs gives `boolean | string | array | undefined`). */
export const flag = (value: unknown): boolean => value === true;

/** The message of anything thrown. */
export const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The parsed command line. */
export type ParsedArgs = ReturnType<typeof parseArgs>;

/** A parsed value as parseArgs returns it. */
export type ParsedValue = ParsedArgs["values"][string];

/** Every option of a script: its own, then the common ones; a clash is a mistake in the definition. */
export const mergeOptions = (
  name: string,
  own: Readonly<Record<string, ScriptOption>>,
  extra: Readonly<Record<string, ScriptOption>>
): Record<string, ScriptOption> => {
  const shorts = new Map<string, string>();
  for (const [optionName, option] of [...Object.entries(own), ...Object.entries(extra)]) {
    if (!option.short) continue;
    const taken = shorts.get(option.short);
    if (taken) throw new Error(`${name}: -${option.short} is used by both --${taken} and --${optionName}`);
    shorts.set(option.short, optionName);
  }
  for (const optionName of Object.keys(own)) {
    if (optionName in extra) throw new Error(`${name}: --${optionName} is a common option of the kit`);
  }
  return { ...own, ...extra };
};

/**
 * Checks the option declarations: `required`, `value` and `impliedValue` belong to options with a value; `min`, `max`
 * and `integer` to number options, whose default is a number in their range and which have no choices or optional
 * value; a string option's default is a string.
 */
export const checkOptions = (name: string, options: Readonly<Record<string, ScriptOption>>): void => {
  for (const [optionName, option] of Object.entries(options)) {
    const label = `${name}: --${optionName}`;
    checkValueRules(label, option);
    if (option.type === "number") checkNumberOption(label, option);
    else if (option.min !== undefined || option.max !== undefined || option.integer) {
      throw new Error(`${label} is not a number option: min, max and integer belong to number options`);
    }
    if (option.type === "string" && typeof option.default === "number") {
      throw new Error(`${label} is a string option: its default is a string`);
    }
    if (option.schema && option.type !== "string")
      throw new Error(`${label} is not a string option: a schema checks a string`);
  }
};

/**
 * Checks the rules of an option's value: a boolean takes none and cannot be required, an implied value needs an
 * optional one.
 *
 * @param label - The option, for the message.
 * @param option - Its declaration.
 * @throws Error at definition time.
 */
const checkValueRules = (label: string, option: ScriptOption): void => {
  if (option.type === "boolean" && (option.required || option.value || option.impliedValue !== undefined)) {
    throw new Error(`${label} is a boolean, it takes no value and cannot be required`);
  }
  if (option.impliedValue !== undefined && option.value !== "optional") {
    throw new Error(`${label} has an impliedValue but its value is not optional`);
  }
};

/**
 * Checks a number option's declaration.
 *
 * @param label - The option, for the message.
 * @param option - Its declaration.
 * @throws Error at definition time.
 */
const checkNumberOption = (label: string, option: ScriptOption): void => {
  if (option.choices) throw new Error(`${label} is a number option: give it min and max, not choices`);
  if (option.value === "optional")
    throw new Error(`${label} is a number option: its value cannot be optional`);
  if (option.min !== undefined && option.max !== undefined && option.min > option.max) {
    throw new Error(`${label} has min ${option.min} above max ${option.max}`);
  }
  if (typeof option.default === "string")
    throw new Error(`${label} is a number option: its default is a number`);
  if (option.default !== undefined) numberProblem(option, option.default, label);
};

/**
 * Why a number is outside what an option takes, or nothing.
 *
 * @param option - The declaration.
 * @param value - The number.
 * @param label - The option (and, for a definition, the script), for the message.
 * @throws Error at definition time for a default out of range; the caller turns a typed value's into a usage error.
 */
const numberProblem = (option: ScriptOption, value: number, label: string): void => {
  if (option.integer && !Number.isInteger(value))
    throw new Error(`${label} must be a whole number (got ${value})`);
  const isBelow = option.min !== undefined && value < option.min;
  const isAbove = option.max !== undefined && value > option.max;
  if (isBelow || isAbove) throw new Error(`${label} must be ${rangeText(option)} (got ${value})`);
};

/**
 * A number option's range in words: `between 0 and 600`, `at least 0`, `at most 600`.
 *
 * @param option - The declaration.
 * @returns The range, or an empty text without one.
 */
export const rangeText = (option: ScriptOption): string => {
  if (option.min !== undefined && option.max !== undefined) return `between ${option.min} and ${option.max}`;
  if (option.min !== undefined) return `at least ${option.min}`;
  if (option.max !== undefined) return `at most ${option.max}`;
  return "";
};

/**
 * A number from the text the user gave, checked against the option.
 *
 * @param label - The option (`--timeout`, or `TIMEOUT=…` for its environment variable).
 * @param option - Its declaration.
 * @param text - What was given.
 * @throws ArgumentError when the text is not a number, or the number is not what the option takes.
 */
const numberFrom = (label: string, option: ScriptOption, text: string): number => {
  const value = text.trim() === "" ? Number.NaN : Number(text);
  if (!Number.isFinite(value)) throw new ArgumentError(`${label} must be a number (got "${text}")`);
  try {
    numberProblem(option, value, label);
  } catch (error) {
    throw new ArgumentError(messageOf(error));
  }
  return value;
};

/**
 * Rewrites options with an optional value given alone (`--color`, `-c`) to carry their implied value
 * (`--color=auto`), so `parseArgs`, which only knows required values, can read them. Stops at `--`.
 */
const fillImpliedValues = (
  argv: readonly string[],
  options: Readonly<Record<string, ScriptOption>>
): string[] => {
  const bare = new Map<string, string>();
  for (const [name, option] of Object.entries(options)) {
    if (option.value !== "optional") continue;
    const implied = `--${name}=${option.impliedValue ?? ""}`;
    bare.set(`--${name}`, implied);
    if (option.short) bare.set(`-${option.short}`, implied);
  }
  const end = argv.indexOf("--");
  return argv.map((token, index) => ((end < 0 || index < end) && bare.get(token)) || token);
};

/** Checks the positional declarations: required ones first, a variadic one only last. */
export const checkPositionals = (name: string, positionals: readonly ScriptPositional[]): void => {
  positionals.forEach((positional, index) => {
    const previous = positionals[index - 1];
    if (positional.required && previous && !previous.required) {
      throw new Error(`${name}: required <${positional.name}> comes after an optional argument`);
    }
    if (positional.variadic && index !== positionals.length - 1) {
      throw new Error(`${name}: variadic <${positional.name}> must be the last argument`);
    }
    if (positional.raw && index !== positionals.length - 1) {
      throw new Error(`${name}: raw <${positional.name}> must be the last argument`);
    }
  });
};

/** Whether a token is an option that takes the next token as its value (`--name value`, `-n value`). */
export const takesValue = (token: string, options: Readonly<Record<string, ScriptOption>>): boolean =>
  Object.entries(options).some(
    ([name, option]) =>
      option.type !== "boolean" &&
      option.value !== "optional" &&
      (token === `--${name}` || (option.short !== undefined && token === `-${option.short}`))
  );

/**
 * The command line split where a raw positional starts, right after the positionals before it: the head is parsed as
 * usual, the tail is handed over as it is, options included. The script's own options go before (a string option's
 * value is skipped while counting); `--` ends the head too.
 */
export const splitAtRaw = (
  argv: readonly string[],
  options: Readonly<Record<string, ScriptOption>>,
  positionals: readonly ScriptPositional[]
): { head: readonly string[]; tail: readonly string[] } => {
  const rawAt = positionals.findIndex((positional) => positional.raw);
  if (rawAt < 0) return { head: argv, tail: [] };
  let seen = 0;
  for (let index = 0; index < argv.length; index++) {
    // the positionals before the raw one are in: from here on, everything is the raw part
    if (seen === rawAt) return { head: argv.slice(0, index), tail: argv.slice(index) };
    const token = argv[index] ?? "";
    if (token === "--") return { head: argv.slice(0, index), tail: argv.slice(index + 1) };
    if (token.startsWith("-") && token !== "-") {
      if (takesValue(token, options)) index++;
      continue;
    }
    seen++;
  }
  return { head: argv, tail: [] };
};

/** Parses the command line against the declared options (strict: unknown options throw). */
export const parseCommandLine = (
  argv: readonly string[],
  options: Readonly<Record<string, ScriptOption>>
): ParsedArgs =>
  parseArgs({
    args: fillImpliedValues(argv, options),
    allowPositionals: true,
    strict: true,
    options: Object.fromEntries(
      Object.entries(options).map(([name, option]) => [
        name,
        {
          type: option.type === "boolean" ? "boolean" : "string",
          ...(option.short ? { short: option.short } : {}),
          ...(option.multiple ? { multiple: true } : {})
        }
      ])
    )
  });

/** The value of an option taken from its environment variable, or undefined when that is not set. */
const envValue = (name: string, option: ScriptOption, env: ScriptIo["env"]): ParsedValue => {
  if (!option.env) return undefined;
  const raw = env[option.env];
  if (raw === undefined) return undefined;
  if (option.type === "boolean") {
    const value = ENV_BOOLEANS[raw.trim().toLowerCase()];
    if (value === undefined)
      throw new ArgumentError(`${option.env}=${raw} is not a yes/no value for --${name}`);
    return option.multiple ? [value] : value;
  }
  return option.multiple
    ? raw
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    : raw;
};

/** Fails when a string value is outside the declared choices. */
const checkChoices = (label: string, value: ParsedValue, choices: readonly string[] | undefined): void => {
  if (!choices) return;
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    if (typeof item === "string" && !choices.includes(item)) {
      throw new ArgumentError(`${label} must be one of ${choices.join(", ")} (got "${item}")`);
    }
  }
};

/** An option's value as `run` receives it: parseArgs's, or a number option's numbers. */
type OptionValueAtRun = ParsedValue | number | readonly number[];

/**
 * A number option's numbers from the texts given on the command line or in its environment variable.
 *
 * @param name - The option.
 * @param option - Its declaration.
 * @param value - What was given; none when nothing was.
 * @param isFromEnv - Whether it came from the environment variable, which the message then names.
 */
const numbersOf = (
  name: string,
  option: ScriptOption,
  value: ParsedValue,
  isFromEnv: boolean
): number | readonly number[] | undefined => {
  const label = isFromEnv && option.env ? option.env : `--${name}`;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((text) => numberFrom(label, option, String(text)));
  return numberFrom(label, option, String(value));
};

/** One option's value: command line, then environment, then the declared default; required ones checked. */
const optionValue = (
  name: string,
  option: ScriptOption,
  given: ParsedValue,
  env: ScriptIo["env"]
): OptionValueAtRun => {
  const fromEnv = given === undefined ? envValue(name, option, env) : undefined;
  const value = given ?? fromEnv;
  checkChoices(`--${name}`, value, option.choices);
  if (option.type === "boolean") return option.multiple ? (value ?? []) : flag(value);
  const typed = option.type === "number" ? numbersOf(name, option, value, given === undefined) : value;
  const resolved = typed ?? option.default;
  if (option.required) checkPresent(name, option, resolved);
  return resolved ?? (option.multiple ? [] : undefined);
};

/**
 * Fails when a required option has no value after the command line, its environment variable and its default.
 *
 * @param name - The option.
 * @param option - Its declaration.
 * @param value - Its value so far.
 * @throws ArgumentError naming the option (and its environment variable).
 */
const checkPresent = (name: string, option: ScriptOption, value: OptionValueAtRun): void => {
  if (value !== undefined && !(Array.isArray(value) && value.length === 0)) return;
  throw new ArgumentError(
    option.env ? `missing option --${name} (or ${option.env})` : `missing option --${name}`
  );
};

/**
 * The script's own option values by name, from the command line, the environment and the defaults, before their
 * schemas check them (`schema.ts`).
 */
export const optionValues = (
  declared: Readonly<Record<string, ScriptOption>>,
  values: ParsedArgs["values"],
  env: ScriptIo["env"]
): Readonly<Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(declared).map(([name, option]) => [name, optionValue(name, option, values[name], env)])
  );

/** The positional values by name, after checking count and choices, before their schemas check them. */
export const positionalValues = (
  declared: readonly ScriptPositional[],
  given: readonly string[]
): Readonly<Record<string, unknown>> => {
  const last = declared.at(-1);
  if (!(last?.variadic || last?.raw) && given.length > declared.length) {
    const extra = given.slice(declared.length).join(" ");
    throw new ArgumentError(
      declared.length === 0 ? `unexpected argument: ${extra}` : `too many arguments: ${extra}`
    );
  }
  const entries = declared.map((positional, index) => {
    const value = positional.variadic || positional.raw ? given.slice(index) : given[index];
    const isMissing = value === undefined || (Array.isArray(value) && value.length === 0);
    if (positional.required && isMissing) throw new ArgumentError(`missing argument <${positional.name}>`);
    checkChoices(`<${positional.name}>`, value, positional.choices);
    return [positional.name, value];
  });
  return Object.fromEntries(entries);
};
