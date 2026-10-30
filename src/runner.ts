/**
 * How a defined command line runs, shared by `defineScript` and `defineCommands`: the information printed instead of
 * running (`CLI_KIT_DESCRIBE`, `--help`, `--version`), the arguments parsed, the header, the work raced against
 * Ctrl+C with its cleanups, and every failure turned into a message and an exit code.
 *
 * @remarks
 * It takes the errors from `script.ts`, which takes `runTarget` from here: each uses the other's exports only inside
 * functions, never while the modules load, so the cycle is safe. `ScriptError` and `usageError` stay in `script.ts`,
 * where scripts import them.
 *
 * @module
 */

import {
  ArgumentError,
  flag,
  messageOf,
  ownValues,
  type ParsedArgs,
  parseCommandLine,
  positionalValues,
  splitAtRaw
} from "./args.ts";
import { ENV, EXIT } from "./constants.ts";
import { createExitHooks, listenForSignals } from "./exit.ts";
import { formatJson } from "./files.ts";
import { supportsUnicode } from "./glyphs.ts";
import type { GlyphName } from "./glyphs.types.ts";
import { header } from "./header.ts";
import type { ScriptOption, ScriptPositional } from "./help.types.ts";
import type { ScriptIo } from "./io.types.ts";
import { createLogger } from "./log.ts";
import type { Logger } from "./log.types.ts";
import { ScriptError, usageError } from "./script.ts";
import type { ScriptContext } from "./script.types.ts";
import { supportsColor } from "./style.ts";
import type { Tone } from "./style.types.ts";

/** The options every script accepts. */
export const COMMON_OPTIONS: Readonly<Record<string, ScriptOption>> = {
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

/** The settings that add options of the kit's own. */
export type KitOptionSettings = {
  /** Whether the command asks questions: adds `--yes`. */
  readonly prompts?: boolean | undefined;
  /** Whether the command prints its result as JSON: adds `--json`. */
  readonly json?: boolean | undefined;
  /** The command's version: adds `--version`. */
  readonly version?: string | undefined;
};

/**
 * The options the kit adds to a command: `--yes`, `--json`, `--version` when its settings ask for them, and the common
 * ones every command accepts.
 *
 * @param settings - The command's settings.
 */
export const kitOptions = (settings: KitOptionSettings): Readonly<Record<string, ScriptOption>> => ({
  ...(settings.prompts ? { yes: YES_OPTION } : {}),
  ...(settings.json ? { json: JSON_OPTION } : {}),
  ...(settings.version ? { version: VERSION_OPTION } : {}),
  ...COMMON_OPTIONS
});

/** What the header line shows, or `false` for none. */
export type HeaderSettings = {
  /** The command's name, the whole path for a subcommand (`radar-kb note add`). */
  readonly name: string;
  /** Its one-line summary. */
  readonly summary: string;
  /** Its glyph. */
  readonly icon?: GlyphName | undefined;
  /** Its tone. */
  readonly tone?: Tone | undefined;
  /** Its version. */
  readonly version?: string | undefined;
};

/** A command line ready to run: what it accepts, what it prints instead of running, and its work. */
export type RunTarget<
  TOptions extends Readonly<Record<string, ScriptOption>>,
  TPositionals extends readonly ScriptPositional[]
> = {
  /** How the command is called, for the "Run … --help" hint. */
  readonly command: string;
  /** The options whose values reach the work, typed by `TOptions`. */
  readonly options: Readonly<Record<string, ScriptOption>>;
  /** Every option the command line accepts: those, and the kit's. */
  readonly allOptions: Readonly<Record<string, ScriptOption>>;
  /** The positionals, in order. */
  readonly positionals: readonly ScriptPositional[];
  /** The text `--help` prints. */
  readonly help: (color: boolean) => string;
  /** The JSON description `CLI_KIT_DESCRIBE=1` prints, already formatted. */
  readonly describe: () => string;
  /** The version `--version` prints, when there is one. */
  readonly version?: string | undefined;
  /** The header line's settings, or `false` for none. */
  readonly header: HeaderSettings | false;
  /** The path of command words it was called through; empty for a script. */
  readonly path: readonly string[];
  /** The work. */
  readonly run: (context: ScriptContext<TOptions, TPositionals>) => unknown;
  /** Told of an unexpected failure (not a `ScriptError`). */
  readonly onFailure?: ((error: unknown) => void) | undefined;
};

/** Hands an unexpected failure (not a `ScriptError`) to the command's `onFailure`; what that throws is ignored. */
const tellFailure = (onFailure: ((error: unknown) => void) | undefined, error: unknown): void => {
  if (!onFailure || error instanceof ScriptError) return;
  try {
    onFailure(error);
  } catch {
    // the report failed: the command still ends with its own message and exit code
  }
};

/**
 * Prints a failure and returns its exit code: a `ScriptError` as its message and hint, a usage error with a pointer to
 * `--help`, anything else as its message (its stack with `--verbose`).
 *
 * @param error - What was thrown.
 * @param log - The run's logger.
 * @param command - How the command is called, for the hint.
 */
export const reportFailure = (error: unknown, log: Logger, command: string): number => {
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
 * A logger for what goes wrong before the options are read (a command line that does not parse).
 *
 * @param io - The run's io.
 */
export const plainLogger = (io: ScriptIo): Logger =>
  createLogger({
    stdout: io.stdout,
    stderr: io.stderr,
    unicode: supportsUnicode(io.env),
    color: supportsColor(io.stderr, io.env)
  });

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

/** A command line's problem as the kit reports it: a usage error, with the same message. */
const asUsageError = (error: unknown): unknown =>
  error instanceof ArgumentError ? usageError(error.message) : error;

/** The text printed instead of running (`CLI_KIT_DESCRIBE`, `--help`, `--version`), or undefined to run. */
const informationOnly = <
  TOptions extends Readonly<Record<string, ScriptOption>>,
  TPositionals extends readonly ScriptPositional[]
>(
  target: RunTarget<TOptions, TPositionals>,
  io: ScriptIo,
  values: ParsedArgs["values"] | undefined,
  color: boolean
): string | undefined => {
  if (io.env[ENV.describe] === "1") return target.describe();
  if (flag(values?.["help"])) return target.help(color);
  if (target.version && flag(values?.["version"])) return `${target.version}\n`;
  return undefined;
};

/** Runs the work with its cleanups, racing Ctrl+C; returns the exit code. */
const execute = async <
  TOptions extends Readonly<Record<string, ScriptOption>>,
  TPositionals extends readonly ScriptPositional[]
>(
  target: RunTarget<TOptions, TPositionals>,
  io: ScriptIo,
  parsed: ParsedArgs,
  log: Logger,
  isJson: boolean
): Promise<number> => {
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
    let context: ScriptContext<TOptions, TPositionals>;
    try {
      context = {
        options: ownValues<TOptions>(target.options, parsed.values, io.env),
        args: positionalValues<TPositionals>(target.positionals, parsed.positionals),
        positionals: parsed.positionals,
        path: target.path,
        log,
        style: log.style,
        io,
        isJson,
        isYes: flag(parsed.values["yes"]),
        onInterrupt,
        onExit: hooks.add
      };
    } catch (error) {
      throw asUsageError(error);
    }
    const result = await target.run(context);
    if (isJson && result !== undefined) io.stdout.write(formatJson(result));
    return EXIT.ok;
  };
  const outcome = await Promise.race([
    work().then(
      (code) => ({ code, isSignal: false }),
      (error: unknown) => {
        tellFailure(target.onFailure, error);
        return { code: reportFailure(error, log, target.command), isSignal: false };
      }
    ),
    signalled.then((code) => ({ code, isSignal: true }))
  ]);
  stopListening();
  for (const error of await hooks.runAll()) log.warn(`cleanup failed: ${messageOf(error)}`);
  if (outcome.isSignal) io.exit(outcome.code);
  return outcome.code;
};

/**
 * Runs a command line against a target: prints its information instead when asked, parses the arguments, prints the
 * header, runs the work. Sets the process exit code and returns it.
 *
 * @param target - What the command accepts and does.
 * @param argv - The arguments after the command (and after its command words, for a subcommand).
 * @param io - The run's io.
 */
export const runTarget = async <
  TOptions extends Readonly<Record<string, ScriptOption>>,
  TPositionals extends readonly ScriptPositional[]
>(
  target: RunTarget<TOptions, TPositionals>,
  argv: readonly string[],
  io: ScriptIo
): Promise<number> => {
  const finish = (code: number): number => {
    io.setExitCode(code);
    return code;
  };
  const description = informationOnly(target, io, undefined, false);
  if (description) {
    io.stdout.write(description);
    return finish(EXIT.ok);
  }
  let parsed: ParsedArgs;
  const { head, tail } = splitAtRaw(argv, target.allOptions, target.positionals);
  try {
    const own = parseCommandLine(head, target.allOptions);
    // a raw positional's part, untouched, after the parsed ones
    parsed = { ...own, positionals: [...own.positionals, ...tail] };
  } catch (error) {
    return finish(reportFailure(usageError(messageOf(error)), plainLogger(io), target.command));
  }
  const color = !flag(parsed.values["no-color"]) && supportsColor(io.stdout, io.env);
  const information = informationOnly(target, io, parsed.values, color);
  if (information) {
    io.stdout.write(information);
    return finish(EXIT.ok);
  }
  const log = loggerFor(io, parsed.values);
  const isJson = flag(parsed.values["json"]);
  if (!isJson && !log.isQuiet && target.header !== false) {
    io.stderr.write(`${header(target.header, log.errorStyle)}\n`);
  }
  return finish(await execute(target, io, parsed, log, isJson));
};
