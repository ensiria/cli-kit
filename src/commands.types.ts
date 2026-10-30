/**
 * The public types of `defineCommands`: a command line made of named commands, nested in groups to any depth, each
 * command typed with its own options and those of the groups above it.
 *
 * @module
 */
import type { GlyphName } from "./glyphs.types.ts";
import type { ScriptExample, ScriptOption, ScriptPositional } from "./help.types.ts";
import type { ScriptIo } from "./io.types.ts";
import type { Script, ScriptContext } from "./script.types.ts";
import type { Tone } from "./style.types.ts";

/** Options by long name. */
export type CommandOptions = Readonly<Record<string, ScriptOption>>;

/** No options: what a group or a command without any declares. */
export type NoOptions = Record<never, ScriptOption>;

/**
 * What a command takes from the group above it unless it sets its own: the header and its look, the `--json` and
 * `--yes` modes, and who is told of an unexpected failure.
 */
export interface InheritedSettings {
  /** Whether to print the header line on stderr. @defaultValue the group's (true at the top) */
  readonly header?: boolean | undefined;
  /** The header's glyph. @defaultValue the group's */
  readonly icon?: GlyphName | undefined;
  /** The header's tone. @defaultValue the group's */
  readonly tone?: Tone | undefined;
  /** Whether the command prints its result as JSON with `--json`. @defaultValue the group's */
  readonly json?: boolean | undefined;
  /** Whether the command asks questions (adds `--yes`). @defaultValue the group's */
  readonly prompts?: boolean | undefined;
  /** Told of an unexpected failure (not a `ScriptError`), before its message is printed. @defaultValue the group's */
  readonly onFailure?: ((error: unknown) => void) | undefined;
}

/**
 * A command that runs: its options and positionals, its examples and its work, which receives its own options and
 * those of every group above it, typed.
 */
export interface CommandDefinition<
  TInherited extends CommandOptions,
  TOwn extends CommandOptions,
  TPositionals extends readonly ScriptPositional[],
  TResult
> extends InheritedSettings {
  /** One line: what the command does. */
  readonly summary: string;
  /** A longer explanation, shown under the summary. */
  readonly description?: string | undefined;
  /** Its own options, by long name; a name a group above it declares is a definition error. */
  readonly options?: TOwn | undefined;
  /** Its positional arguments, in order. */
  readonly positionals?: TPositionals | undefined;
  /** Examples, written as the whole command line. */
  readonly examples?: readonly ScriptExample[] | undefined;
  /** The work: the options of its groups and its own, its positionals, the path it was called through. */
  readonly run: (context: ScriptContext<TInherited & TOwn, TPositionals>) => TResult | Promise<TResult>;
}

/** A group of commands: options its commands share, and the commands, declared through its scope. */
export interface GroupDefinition<TInherited extends CommandOptions, TOwn extends CommandOptions>
  extends InheritedSettings {
  /** One line: what the group's commands are about. */
  readonly summary: string;
  /** A longer explanation, shown under the summary. */
  readonly description?: string | undefined;
  /** Options every command of the group accepts, before or after the command words. */
  readonly options?: TOwn | undefined;
  /** Examples, written as the whole command line. */
  readonly examples?: readonly ScriptExample[] | undefined;
  /** Old command names still accepted, each with the command it now is; using one prints a note on stderr. */
  readonly aliases?: Readonly<Record<string, string>> | undefined;
  /** The group's commands by their word, declared through the scope, which carries the group's options' types. */
  readonly commands: (scope: CommandScope<TInherited & TOwn>) => Readonly<Record<string, CommandNode>>;
}

/** The top of a command line made of commands: a group with the command's name, how it is run, and its version. */
export interface CommandsDefinition<TOwn extends CommandOptions> extends GroupDefinition<NoOptions, TOwn> {
  /** The command's name, for the header and the docs (`radar-kb`). */
  readonly name: string;
  /** How it is run (`radar-kb`, `node tools/kb.mts`). */
  readonly command: string;
  /** The version `--version` prints; none adds no `--version`. */
  readonly version?: string | undefined;
}

/**
 * What a group hands its `commands`: makes its commands and groups, each typed with the options of the groups above
 * it (`TInherited`).
 */
export interface CommandScope<TInherited extends CommandOptions> {
  /** A command that runs. */
  readonly command: <
    const TOwn extends CommandOptions = NoOptions,
    const TPositionals extends readonly ScriptPositional[] = [],
    TResult = void
  >(
    definition: CommandDefinition<TInherited, TOwn, TPositionals, TResult>
  ) => CommandNode;
  /** A group of commands under a word of its own. */
  readonly group: <const TOwn extends CommandOptions = NoOptions>(
    definition: GroupDefinition<TInherited, TOwn>
  ) => CommandNode;
}

/** Where a command sits once the tree is built: what its run needs that its definition does not know. */
export interface CommandPlace {
  /** The command words leading to it (`["note", "add"]`). */
  readonly path: readonly string[];
  /** How it is called, the words included (`radar-kb note add`). */
  readonly command: string;
  /** The options of the groups above it. */
  readonly inherited: CommandOptions;
  /** Every option its command line accepts: the inherited ones, its own and the kit's. */
  readonly allOptions: CommandOptions;
  /** Its settings, the groups' filled in. */
  readonly settings: InheritedSettings;
  /** The command's name for the header (`radar-kb note add`). */
  readonly name: string;
  /** The top's version. */
  readonly version: string | undefined;
  /** Its `--help`. */
  readonly help: (color: boolean) => string;
  /** The whole tree's JSON description, for `CLI_KIT_DESCRIBE=1`. */
  readonly describe: () => string;
}

/** A command or a group, as its scope made it: the tree `defineCommands` builds and runs. */
export type CommandNode =
  | {
      /** A command that runs. */
      readonly kind: "command";
      /** Its definition's fields the tree reads. */
      readonly summary: string;
      /** Its longer explanation. */
      readonly description: string | undefined;
      /** Its own options. */
      readonly options: CommandOptions;
      /** Its positionals. */
      readonly positionals: readonly ScriptPositional[];
      /** Its examples. */
      readonly examples: readonly ScriptExample[] | undefined;
      /** Its own settings. */
      readonly settings: InheritedSettings;
      /** Runs it with the arguments after its command words, at its place in the tree; returns the exit code. */
      readonly start: (place: CommandPlace, argv: readonly string[], io: ScriptIo) => Promise<number>;
    }
  | {
      /** A group of commands. */
      readonly kind: "group";
      /** One line: what its commands are about. */
      readonly summary: string;
      /** Its longer explanation. */
      readonly description: string | undefined;
      /** The options its commands share. */
      readonly options: CommandOptions;
      /** Its examples. */
      readonly examples: readonly ScriptExample[] | undefined;
      /** Its own settings. */
      readonly settings: InheritedSettings;
      /** Old command names, each with the command it now is. */
      readonly aliases: Readonly<Record<string, string>>;
      /** Its commands, by word. */
      readonly commands: Readonly<Record<string, CommandNode>>;
    };

/** A command line made of commands: runs like a script, its help and docs cover every command. */
export type Commands = Script;
