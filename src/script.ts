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
import { checkOptions, checkPositionals, mergeOptions } from "./args.ts";
import { EXIT } from "./constants.ts";
import { formatHelpJson } from "./docs.ts";
import { formatJson } from "./files.ts";
import { formatHelp, formatHelpMarkdown } from "./help.ts";
import type { HelpSource, ScriptOption, ScriptPositional } from "./help.types.ts";
import { processIo } from "./io.ts";
import { kitOptions, type RunTarget, runTarget } from "./runner.ts";
import type { RunOptions, Script, ScriptDefinition } from "./script.types.ts";

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
  const allOptions = mergeOptions(definition.name, ownOptions, kitOptions(definition));
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
  const { name, summary, icon, tone, version } = definition;
  const target: RunTarget<TOptions, TPositionals> = {
    command: definition.command,
    options: ownOptions,
    allOptions,
    positionals: declaredPositionals,
    help: (color: boolean): string => formatHelp(source, color),
    describe: (): string => formatJson(formatHelpJson(source)),
    version: definition.version,
    header: definition.header === false ? false : { name, summary, icon, tone, version },
    path: [],
    run: definition.run,
    onFailure: definition.onFailure
  };

  return {
    run: (argv?: readonly string[], options: RunOptions = {}): Promise<number> => {
      const io = options.io ?? processIo();
      return runTarget(target, argv ?? io.argv, io);
    },
    help: (color = false): string => formatHelp(source, color),
    markdown: (): string => formatHelpMarkdown(source),
    source
  };
};
