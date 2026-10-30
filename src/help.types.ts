/**
 * The types of a script's usage: its options, positional arguments and examples, the data every help format is
 * generated from.
 *
 * @module
 */

/** One option a script accepts. */
export interface ScriptOption {
  /** `boolean` for a flag, `string` for an option with a value. */
  readonly type: "boolean" | "string";
  /** What the option does, one sentence. */
  readonly description: string;
  /** One-letter alias (`-c`). */
  readonly short?: string | undefined;
  /** Placeholder for the value in the help (`<path>`). @defaultValue "value" */
  readonly valueName?: string | undefined;
  /** Whether the option may be given more than once (its value is then an array). @defaultValue false */
  readonly multiple?: boolean | undefined;
  /** Value of a string option when it is not given (on the command line nor in `env`). */
  readonly default?: string | undefined;
  /** The only values a string option accepts; anything else is a usage error. Shell completions offer them. */
  readonly choices?: readonly string[] | undefined;
  /**
   * Environment variable read when the option is not on the command line (`RADAR_TOKEN`). Booleans accept
   * `1` / `true` / `yes` and `0` / `false` / `no`; a `multiple` string option splits the value on commas.
   */
  readonly env?: string | undefined;
  /**
   * Whether the script fails with a usage error when the option has no value after the command line, `env` and
   * `default` (string options only). Its value is then typed `string`.
   * @defaultValue false
   */
  readonly required?: boolean | undefined;
  /**
   * Whether a string option's value must follow it (`required`, `--base main`) or may be left out (`optional`:
   * `--color` alone takes `impliedValue`, `--color=never` its own value). An optional value is attached with `=`
   * (or `-cnever`), since `--color never` would be ambiguous with a positional argument.
   * @defaultValue "required"
   */
  readonly value?: "required" | "optional" | undefined;
  /** The value of an option with an optional value when it is given alone (`--color` → `"auto"`). @defaultValue "" */
  readonly impliedValue?: string | undefined;
}

/** A positional argument. */
export interface ScriptPositional {
  /** Name shown in the usage line, and the key of the value in `args`. */
  readonly name: string;
  /** What it is. */
  readonly description: string;
  /** Whether the script fails with a usage error without it. @defaultValue false */
  readonly required?: boolean | undefined;
  /** Whether it takes every remaining argument (only the last positional). @defaultValue false */
  readonly variadic?: boolean | undefined;
  /**
   * Whether it takes every remaining argument as it is, options included, without parsing them (only the last
   * positional; variadic by itself): the arguments a wrapper hands to the command it runs. The script's own options
   * still work before it (`--help`). @defaultValue false
   */
  readonly raw?: boolean | undefined;
  /** The only values it accepts; shell completions offer them. */
  readonly choices?: readonly string[] | undefined;
}

/** One example in the help. */
export interface ScriptExample {
  /** The command as typed. */
  readonly command: string;
  /** What it does. */
  readonly description: string;
}

/** The parts of a script definition every help format needs. */
export interface HelpSource {
  /** Short name of the script (`build-order`). */
  readonly name: string;
  /** How it is run (`node tools/build-order.mts`). */
  readonly command: string;
  /** One line: what it does. */
  readonly summary: string;
  /** Longer explanation, shown under the summary. */
  readonly description?: string | undefined;
  /** The script's version, when it has one. */
  readonly version?: string | undefined;
  /** Options, by long name, the common ones included. */
  readonly options: Readonly<Record<string, ScriptOption>>;
  /** Positional arguments, in order. */
  readonly positionals?: readonly ScriptPositional[] | undefined;
  /** Examples. */
  readonly examples?: readonly ScriptExample[] | undefined;
}
