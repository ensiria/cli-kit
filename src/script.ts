/**
 * `defineScript`: one definition per script (name, options, positionals, examples, run) from which the kit parses and
 * validates the arguments, prints `--help` and `--version`, adds the common options, prints the header, runs the
 * cleanups and turns failures into a clear message and an exit code.
 *
 * @remarks
 * A script's file is then only its definition and its own logic. Usage errors (unknown option, missing argument, a
 * value outside its choices) exit with `EXIT.usage`; a {@link ScriptError} exits with its own code; anything else
 * thrown exits with `EXIT.failure`, its stack shown with `--verbose`. Ctrl+C runs the cleanups and exits with 130.
 *
 * @module
 */
/* eslint-disable max-lines -- the command-line parser and defineScript in one module; split the parser out when next touched */
import { parseArgs } from "node:util";

import { ENV, EXIT } from "./constants.ts";
import { formatHelpJson } from "./docs.ts";
import { createExitHooks, listenForSignals } from "./exit.ts";
import { formatJson } from "./files.ts";
import { supportsUnicode } from "./glyphs.ts";
import { header } from "./header.ts";
import { formatHelp, formatHelpMarkdown } from "./help.ts";
import type { HelpSource, ScriptOption, ScriptPositional } from "./help.types.ts";
import { processIo } from "./io.ts";
import type { ScriptIo } from "./io.types.ts";
import { createLogger } from "./log.ts";
import type { Logger } from "./log.types.ts";
import type {
  OptionValues,
  PositionalValues,
  RunOptions,
  Script,
  ScriptContext,
  ScriptDefinition
} from "./script.types.ts";
import { supportsColor } from "./style.ts";

/**
 * An expected failure: printed as one error line (plus an optional hint), without a stack trace.
 *
 * @example
 * ```ts
 * throw new ScriptError("BUILD-ORDER.md is not in the computed order", { hint: "Run node tools/build-order.mts" });
 * ```
 */
export class ScriptError extends Error {
  /** The process exit code. */
  readonly exitCode: number;
  /** A second line telling the user what to do. */
  readonly hint: string | undefined;
  /** Whether the script already printed the problem: the run then exits with the code and prints nothing more. */
  readonly isReported: boolean;

  /**
   * @param message - What went wrong, one line.
   * @param options - The exit code (default `EXIT.failure`), a hint, and whether the problem was already printed.
   */
  constructor(
    message: string,
    options: {
      exitCode?: number | undefined;
      hint?: string | undefined;
      isReported?: boolean | undefined;
    } = {}
  ) {
    super(message);
    this.name = "ScriptError";
    this.exitCode = options.exitCode ?? EXIT.failure;
    this.hint = options.hint;
    this.isReported = options.isReported ?? false;
  }
}

/**
 * A usage error: the command line was wrong. Exits with `EXIT.usage` and points to `--help`.
 *
 * @param message - What was wrong.
 * @returns The error to throw.
 */
export const usageError = (message: string): ScriptError =>
  new ScriptError(message, { exitCode: EXIT.usage });

/** The options every script accepts. */
const COMMON_OPTIONS: Readonly<Record<string, ScriptOption>> = {
  help: { type: "boolean", short: "h", description: "Show this help." },
  quiet: { type: "boolean", short: "q", description: "Print only warnings and errors." },
  verbose: { type: "boolean", short: "v", description: "Also print debug lines." },
  "no-color": { type: "boolean", description: "Print without colours (also when NO_COLOR is set)." }
};

/** Added when the definition has a `version`. */
const VERSION_OPTION: ScriptOption = { type: "boolean", short: "V", description: "Print the version." };

/** Added when the definition supports `--json`. */
const JSON_OPTION: ScriptOption = {
  type: "boolean",
  description: "Print the result as JSON on stdout (log lines go to stderr)."
};

/** Added when the script asks questions. */
const YES_OPTION: ScriptOption = {
  type: "boolean",
  short: "y",
  description: "Answer yes to confirmations and take the default of other questions (for CI and scripts)."
};

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
const flag = (value: unknown): boolean => value === true;

/** The message of anything thrown. */
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The parsed command line. */
type ParsedArgs = ReturnType<typeof parseArgs>;

/** A parsed value as parseArgs returns it. */
type ParsedValue = ParsedArgs["values"][string];

/** Every option of a script: its own, then the common ones; a clash is a mistake in the definition. */
const mergeOptions = (
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

/** Checks the option declarations: `required`, `value` and `impliedValue` belong to string options. */
const checkOptions = (name: string, options: Readonly<Record<string, ScriptOption>>): void => {
  for (const [optionName, option] of Object.entries(options)) {
    if (option.type === "boolean" && (option.required || option.value || option.impliedValue !== undefined)) {
      throw new Error(`${name}: --${optionName} is a boolean, it takes no value and cannot be required`);
    }
    if (option.impliedValue !== undefined && option.value !== "optional") {
      throw new Error(`${name}: --${optionName} has an impliedValue but its value is not optional`);
    }
  }
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
const checkPositionals = (name: string, positionals: readonly ScriptPositional[]): void => {
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
const takesValue = (token: string, options: Readonly<Record<string, ScriptOption>>): boolean =>
  Object.entries(options).some(
    ([name, option]) =>
      option.type === "string" &&
      option.value !== "optional" &&
      (token === `--${name}` || (option.short !== undefined && token === `-${option.short}`))
  );

/**
 * The command line split where a raw positional starts, right after the positionals before it: the head is parsed as
 * usual, the tail is handed over as it is, options included. The script's own options go before (a string option's
 * value is skipped while counting); `--` ends the head too.
 */
const splitAtRaw = (
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
const parseCommandLine = (
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
          type: option.type,
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
    if (value === undefined) throw usageError(`${option.env}=${raw} is not a yes/no value for --${name}`);
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
      throw usageError(`${label} must be one of ${choices.join(", ")} (got "${item}")`);
    }
  }
};

/** Whether a resolved value counts as absent (nothing, or an empty list). */
const isAbsent = (value: ParsedValue): boolean =>
  value === undefined || (Array.isArray(value) && value.length === 0);

/** One option's value: command line, then environment, then the declared default; required ones checked. */
const optionValue = (
  name: string,
  option: ScriptOption,
  given: ParsedValue,
  env: ScriptIo["env"]
): ParsedValue => {
  const value = given ?? envValue(name, option, env);
  checkChoices(`--${name}`, value, option.choices);
  if (option.type === "boolean") return option.multiple ? (value ?? []) : flag(value);
  const resolved = value ?? option.default;
  if (option.required && isAbsent(resolved)) {
    throw usageError(option.env ? `missing option --${name} (or ${option.env})` : `missing option --${name}`);
  }
  return resolved ?? (option.multiple ? [] : undefined);
};

/** The script's own option values, typed from their declarations. */
const ownValues = <TOptions extends Readonly<Record<string, ScriptOption>>>(
  declared: Readonly<Record<string, ScriptOption>>,
  values: ParsedArgs["values"],
  env: ScriptIo["env"]
): OptionValues<TOptions> => {
  const entries = Object.entries(declared).map(([name, option]) => [
    name,
    optionValue(name, option, values[name], env)
  ]);
  // built at runtime from the declarations, so its shape is what OptionValues<TOptions> describes
  return Object.fromEntries(entries) as OptionValues<TOptions>;
};

/** The positional values by name, after checking count and choices. */
const positionalValues = <TPositionals extends readonly ScriptPositional[]>(
  declared: readonly ScriptPositional[],
  given: readonly string[]
): PositionalValues<TPositionals> => {
  const last = declared.at(-1);
  if (!(last?.variadic || last?.raw) && given.length > declared.length) {
    const extra = given.slice(declared.length).join(" ");
    throw usageError(
      declared.length === 0 ? `unexpected argument: ${extra}` : `too many arguments: ${extra}`
    );
  }
  const entries = declared.map((positional, index) => {
    const value = positional.variadic || positional.raw ? given.slice(index) : given[index];
    const isMissing = value === undefined || (Array.isArray(value) && value.length === 0);
    if (positional.required && isMissing) throw usageError(`missing argument <${positional.name}>`);
    checkChoices(`<${positional.name}>`, value, positional.choices);
    return [positional.name, value];
  });
  // built at runtime from the declarations, so its shape is what PositionalValues<TPositionals> describes
  return Object.fromEntries(entries) as PositionalValues<TPositionals>;
};

/** Hands an unexpected failure (not a `ScriptError`) to the script's `onFailure`; what that throws is ignored. */
const tellFailure = (onFailure: ((error: unknown) => void) | undefined, error: unknown): void => {
  if (!onFailure || error instanceof ScriptError) return;
  try {
    onFailure(error);
  } catch {
    // the report failed: the script still ends with its own message and exit code
  }
};

/** Prints a failure of the script's work and returns its exit code. */
const reportFailure = (error: unknown, log: Logger, command: string): number => {
  if (error instanceof ScriptError) {
    if (error.isReported) return error.exitCode;
    log.error(error.message);
    if (error.hint) log.hint(error.hint);
    else if (error.exitCode === EXIT.usage) log.hint(`Run ${command} --help for the options.`);
    return error.exitCode;
  }
  log.error(messageOf(error));
  if (error instanceof Error && error.stack) log.debug(error.stack);
  return EXIT.failure;
};

/**
 * Describes a script; call `.run()` at the end of the script's file.
 *
 * @param definition - Name, command, summary, options, positionals, examples and the work.
 * @returns The runnable script with its help and its usage as data.
 * @throws Error at definition time when two options share a short alias, an option clashes with a common one, a
 * boolean is declared with a value or as required, or the positionals are out of order.
 * @example
 * ```ts
 * await defineScript({
 *   name: "build-order",
 *   command: "node tools/build-order.mts",
 *   summary: "Recompute the build order in BUILD-ORDER.md",
 *   options: { check: { type: "boolean", short: "c", description: "Fail when the file is not in order." } },
 *   run: ({ options, log }) => { log.success(options.check ? "valid" : "recomputed"); }
 * }).run();
 * ```
 */
export const defineScript = <
  const TOptions extends Readonly<Record<string, ScriptOption>> = Record<never, ScriptOption>,
  const TPositionals extends readonly ScriptPositional[] = [],
  TResult = void
>(
  definition: ScriptDefinition<TOptions, TPositionals, TResult>
): Script => {
  const ownOptions: Readonly<Record<string, ScriptOption>> = definition.options ?? {};
  const declaredPositionals: readonly ScriptPositional[] = definition.positionals ?? [];
  checkOptions(definition.name, ownOptions);
  checkPositionals(definition.name, declaredPositionals);
  const allOptions = mergeOptions(definition.name, ownOptions, {
    ...(definition.prompts ? { yes: YES_OPTION } : {}),
    ...(definition.json ? { json: JSON_OPTION } : {}),
    ...(definition.version ? { version: VERSION_OPTION } : {}),
    ...COMMON_OPTIONS
  });
  const source: HelpSource = {
    name: definition.name,
    command: definition.command,
    summary: definition.summary,
    description: definition.description,
    version: definition.version,
    options: allOptions,
    positionals: declaredPositionals,
    examples: definition.examples
  };

  /** Runs the work with its cleanups, racing Ctrl+C; returns the exit code. */
  const execute = async (io: ScriptIo, parsed: ParsedArgs, log: Logger, isJson: boolean): Promise<number> => {
    const hooks = createExitHooks();
    const interruptHandlers: (() => void)[] = [];
    let stopListening = (): void => undefined;
    const signalled = new Promise<number>((resolve) => {
      let isInterrupting = false;
      stopListening = listenForSignals(io, (code) => {
        if (interruptHandlers.length === 0 || isInterrupting) {
          resolve(code);
          return;
        }
        isInterrupting = true;
        for (const handler of [...interruptHandlers]) handler();
      });
    });
    const onInterrupt = (handler: () => void): (() => void) => {
      interruptHandlers.push(handler);
      return (): void => {
        const index = interruptHandlers.indexOf(handler);
        if (index >= 0) interruptHandlers.splice(index, 1);
      };
    };
    const work = async (): Promise<number> => {
      const context: ScriptContext<TOptions, TPositionals> = {
        options: ownValues<TOptions>(ownOptions, parsed.values, io.env),
        args: positionalValues<TPositionals>(declaredPositionals, parsed.positionals),
        positionals: parsed.positionals,
        log,
        style: log.style,
        io,
        isJson,
        isYes: flag(parsed.values["yes"]),
        onInterrupt,
        onExit: hooks.add
      };
      const result = await definition.run(context);
      if (isJson && result !== undefined) io.stdout.write(formatJson(result));
      return EXIT.ok;
    };
    const outcome = await Promise.race([
      work().then(
        (code) => ({ code, isSignal: false }),
        (error: unknown) => {
          tellFailure(definition.onFailure, error);
          return { code: reportFailure(error, log, definition.command), isSignal: false };
        }
      ),
      signalled.then((code) => ({ code, isSignal: true }))
    ]);
    stopListening();
    for (const error of await hooks.runAll()) log.warn(`cleanup failed: ${messageOf(error)}`);
    if (outcome.isSignal) io.exit(outcome.code);
    return outcome.code;
  };

  /** The text printed instead of running (`CLI_KIT_DESCRIBE`, `--help`, `--version`), or undefined to run. */
  const informationOnly = (
    io: ScriptIo,
    values: ParsedArgs["values"] | undefined,
    color: boolean
  ): string | undefined => {
    if (io.env[ENV.describe] === "1") return formatJson(formatHelpJson(source));
    if (flag(values?.["help"])) return formatHelp(source, color);
    if (definition.version && flag(values?.["version"])) return `${definition.version}\n`;
    return undefined;
  };

  /** The logger for a run, from the common options. */
  const loggerFor = (io: ScriptIo, values: ParsedArgs["values"]): Logger => {
    const noColor = flag(values["no-color"]);
    return createLogger({
      stdout: io.stdout,
      stderr: io.stderr,
      quiet: flag(values["quiet"]),
      verbose: flag(values["verbose"]),
      json: flag(values["json"]),
      unicode: supportsUnicode(io.env),
      color: !noColor && supportsColor(io.stdout, io.env),
      colorStderr: !noColor && supportsColor(io.stderr, io.env)
    });
  };

  const run = async (argv?: readonly string[], options: RunOptions = {}): Promise<number> => {
    const io = options.io ?? processIo();
    const finish = (code: number): number => {
      io.setExitCode(code);
      return code;
    };
    const description = informationOnly(io, undefined, false);
    if (description) {
      io.stdout.write(description);
      return finish(EXIT.ok);
    }
    let parsed: ParsedArgs;
    const { head, tail } = splitAtRaw(argv ?? io.argv, allOptions, declaredPositionals);
    try {
      const own = parseCommandLine(head, allOptions);
      // a raw positional's part, untouched, after the parsed ones
      parsed = { ...own, positionals: [...own.positionals, ...tail] };
    } catch (error) {
      const color = supportsColor(io.stderr, io.env);
      const log = createLogger({
        stdout: io.stdout,
        stderr: io.stderr,
        unicode: supportsUnicode(io.env),
        color
      });
      return finish(reportFailure(usageError(messageOf(error)), log, definition.command));
    }
    const color = !flag(parsed.values["no-color"]) && supportsColor(io.stdout, io.env);
    const information = informationOnly(io, parsed.values, color);
    if (information) {
      io.stdout.write(information);
      return finish(EXIT.ok);
    }
    const log = loggerFor(io, parsed.values);
    const isJson = flag(parsed.values["json"]);
    if (!isJson && !log.isQuiet && definition.header !== false) {
      const { name, summary, icon, tone, version } = definition;
      io.stderr.write(`${header({ name, summary, icon, tone, version }, log.errorStyle)}\n`);
    }
    return finish(await execute(io, parsed, log, isJson));
  };

  return {
    run,
    help: (color = false): string => formatHelp(source, color),
    markdown: (): string => formatHelpMarkdown(source),
    source
  };
};
