/**
 * The types of the generated documentation: a script's machine-readable description and the shells completions
 * are written for.
 *
 * @module
 */

/** A shell the kit writes completions for. */
export type Shell = "bash" | "zsh" | "fish";

/** One option in a script's description. */
export interface OptionDescription {
  /** Long name, without dashes. */
  readonly name: string;
  /** `boolean` or `string`. */
  readonly type: "boolean" | "string";
  /** What it does. */
  readonly description: string;
  /** One-letter alias, without the dash. */
  readonly short: string | null;
  /** Placeholder of a string option's value. */
  readonly valueName: string | null;
  /** Whether it may be given more than once. */
  readonly multiple: boolean;
  /** Default value of a string option. */
  readonly default: string | null;
  /** Accepted values. */
  readonly choices: readonly string[] | null;
  /** Environment variable read when it is not given. */
  readonly env: string | null;
  /** Whether the script fails without it. */
  readonly required: boolean;
  /** Whether a string option's value must follow it or may be left out; `null` for a flag. */
  readonly value: "required" | "optional" | null;
  /** The value an option with an optional value takes when given alone. */
  readonly impliedValue: string | null;
}

/** One positional argument in a script's description. */
export interface PositionalDescription {
  /** Its name. */
  readonly name: string;
  /** What it is. */
  readonly description: string;
  /** Whether it must be given. */
  readonly required: boolean;
  /** Whether it takes the remaining arguments. */
  readonly variadic: boolean;
  /** Accepted values. */
  readonly choices: readonly string[] | null;
}

/** A script described as data: what `formatHelpJson` returns and `CLI_KIT_DESCRIBE=1` prints. */
export interface ScriptDescription {
  /** The format's version, bumped when its shape changes. */
  readonly schema: 1;
  /** Short name. */
  readonly name: string;
  /** How it is run. */
  readonly command: string;
  /** One line. */
  readonly summary: string;
  /** Longer explanation. */
  readonly description: string | null;
  /** The script's version. */
  readonly version: string | null;
  /** Its options, common ones included. */
  readonly options: readonly OptionDescription[];
  /** Its positional arguments. */
  readonly positionals: readonly PositionalDescription[];
  /** Its examples. */
  readonly examples: readonly { readonly command: string; readonly description: string }[];
  /** For a subcommand: the options of the groups above it, which it accepts too; empty for a script. */
  readonly inheritedOptions: readonly OptionDescription[];
  /** For a group of commands: its commands, each described the same way (`name` is the command word); else empty. */
  readonly commands: readonly ScriptDescription[];
  /** For a group of commands: the old names it still accepts, each with the command it now is; else empty. */
  readonly aliases: Readonly<Record<string, string>>;
}
