/**
 * The types of a script definition and of what its `run` receives, with option and argument values typed from their
 * declarations.
 *
 * @module
 */
import type { Cleanup } from "./exit.types.ts";
import type { GlyphName } from "./glyphs.types.ts";
import type { HelpSource, ScriptExample, ScriptOption, ScriptPositional } from "./help.types.ts";
import type { ScriptIo } from "./io.types.ts";
import type { Logger, OutputStyle } from "./log.types.ts";
import type { Tone } from "./style.types.ts";

/** The value of a string option: one of its `choices` when it has them. */
type StringValue<TOption extends ScriptOption> = TOption extends {
  choices: readonly (infer TChoice extends string)[];
}
  ? TChoice
  : string;

/** The value a parsed option has, from its declaration: booleans default to false, strings may be absent. */
export type OptionValue<TOption extends ScriptOption> = TOption extends { type: "boolean" }
  ? TOption extends { multiple: true }
    ? boolean[]
    : boolean
  : TOption extends { multiple: true }
    ? StringValue<TOption>[]
    : TOption extends { default: string } | { required: true }
      ? StringValue<TOption>
      : StringValue<TOption> | undefined;

/** All parsed option values of a script, typed from its option declarations. */
export type OptionValues<TOptions extends Readonly<Record<string, ScriptOption>>> = {
  readonly [TName in keyof TOptions]: OptionValue<TOptions[TName]>;
};

/** The value of a positional argument, from its declaration. */
type PositionalValue<TPositional extends ScriptPositional> = TPositional extends
  | { variadic: true }
  | { raw: true }
  ? string[]
  : TPositional extends { required: true }
    ? TPositional extends { choices: readonly (infer TChoice extends string)[] }
      ? TChoice
      : string
    : string | undefined;

/** Positional argument values by name, typed from their declarations. */
export type PositionalValues<TPositionals extends readonly ScriptPositional[]> = {
  readonly [TPositional in TPositionals[number] as TPositional["name"]]: PositionalValue<TPositional>;
};

/** What `run` receives. */
export interface ScriptContext<
  TOptions extends Readonly<Record<string, ScriptOption>>,
  TPositionals extends readonly ScriptPositional[]
> {
  /** The script's own options, parsed, validated and typed. */
  readonly options: OptionValues<TOptions>;
  /** Positional arguments by name, validated and typed. */
  readonly args: PositionalValues<TPositionals>;
  /** Positional arguments as given, in order. */
  readonly positionals: readonly string[];
  /** The logger, already set to the common options (`--quiet`, `--verbose`, `--no-color`, `--json`). */
  readonly log: Logger;
  /** How text is drawn on stdout (colour, Unicode, width), for the rendering helpers. */
  readonly style: OutputStyle;
  /** The streams and environment of this run. */
  readonly io: ScriptIo;
  /** Whether `--json` was given: the value `run` returns is printed as the only thing on stdout. */
  readonly isJson: boolean;
  /** Whether `--yes` was given: confirmations answer yes and other prompts take their default. */
  readonly isYes: boolean;
  /**
   * Handles Ctrl+C / SIGTERM gracefully: while a handler is registered, the first signal calls it instead of ending
   * the run, and the run ends when `run` returns (a recorder finishes its file, a server closes). A second signal
   * ends the run at once with 130 / 143. Returns its remover.
   */
  readonly onInterrupt: (handler: () => void) => () => void;
  /** Registers a cleanup that runs when the script ends, fails or is stopped with Ctrl+C; returns its remover. */
  readonly onExit: (cleanup: Cleanup) => () => void;
}

/** A script, described once. */
export interface ScriptDefinition<
  TOptions extends Readonly<Record<string, ScriptOption>>,
  TPositionals extends readonly ScriptPositional[],
  TResult
> {
  /** Short name (`build-order`), shown in the header and the help. */
  readonly name: string;
  /** How it is run (`node tools/build-order.mts`), for the usage line and the examples. */
  readonly command: string;
  /** One line: what it does. */
  readonly summary: string;
  /** Longer explanation for `--help`. */
  readonly description?: string | undefined;
  /** The script's version; when set, `--version` / `-V` prints it (see `readPackageVersion`). */
  readonly version?: string | undefined;
  /**
   * Whether to print the header. Off for helpers that programs run and whose stderr they read (Radar's server
   * shows it in an error), so nothing but the script's own output appears.
   * @defaultValue true
   */
  readonly header?: boolean | undefined;
  /** The header's glyph, so each script is recognisable at a glance. @defaultValue "arrow" */
  readonly icon?: GlyphName | undefined;
  /** The header glyph's tone. @defaultValue "accent" */
  readonly tone?: Tone | undefined;
  /** Whether the script supports `--json`: the value `run` returns becomes stdout, every log line goes to stderr. */
  readonly json?: boolean | undefined;
  /** Whether the script asks questions: adds `--yes` / `-y` to answer them without a terminal. */
  readonly prompts?: boolean | undefined;
  /** The script's own options, by long name (the common ones are added by the kit). */
  readonly options?: TOptions | undefined;
  /** Positional arguments, in order; required ones first, a variadic one last. */
  readonly positionals?: TPositionals | undefined;
  /** Examples for `--help` and the docs. */
  readonly examples?: readonly ScriptExample[] | undefined;
  /** The script's work. Throw a `ScriptError` for an expected failure with its own exit code. */
  readonly run: (context: ScriptContext<TOptions, TPositionals>) => TResult | Promise<TResult>;
  /**
   * Told of a failure that is not a `ScriptError` (a bug rather than an expected problem), before its message is
   * printed: where an app's error capture reports it. What it throws is ignored, so it never changes the exit.
   */
  readonly onFailure?: ((error: unknown) => void) | undefined;
}

/** Options of one `run` call. */
export interface RunOptions {
  /** The streams, environment and signals to use. @defaultValue the real process */
  readonly io?: ScriptIo | undefined;
}

/** What `defineScript` returns. */
export interface Script {
  /** Parses `argv` (default: the io's arguments), runs the script and returns the exit code (also set as the process exit code). */
  readonly run: (argv?: readonly string[], options?: RunOptions) => Promise<number>;
  /** The `--help` text. */
  readonly help: (color?: boolean) => string;
  /** The help as Markdown, for docs. */
  readonly markdown: () => string;
  /** The usage as data (common options included), for the docs, man page, JSON and completion generators. */
  readonly source: HelpSource;
}
