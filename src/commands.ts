/**
 * `defineCommands`: a command line made of named commands (`radar-kb note add`), nested in groups to any depth, each
 * with its own options, positionals, examples and run, and one generated help per level.
 *
 * @remarks
 * A group's options apply to every command under it and may be given before or after the command words; a command's
 * `run` receives its own options and its groups', typed, through the scope its group hands it. The words are read
 * from the start of the command line, skipping options (and the value of an option that takes one); the rest is
 * parsed by the command reached, which runs exactly as a `defineScript` script does. A group called without a command
 * is a usage error that lists its commands; `--help` at any level prints that level's help. Old names in a group's
 * `aliases` still work and print a note on stderr.
 *
 * @module
 */

import {
  checkOptions,
  checkPositionals,
  flag,
  mergeOptions,
  messageOf,
  parseCommandLine,
  takesValue
} from "./args.ts";
import type {
  CommandDefinition,
  CommandNode,
  CommandOptions,
  CommandPlace,
  CommandScope,
  Commands,
  CommandsDefinition,
  GroupDefinition,
  InheritedSettings,
  NoOptions
} from "./commands.types.ts";
import { ENV, EXIT } from "./constants.ts";
import { formatHelpJson } from "./docs.ts";
import { formatJson } from "./files.ts";
import { formatHelp, formatHelpMarkdown } from "./help.ts";
import type { HelpSource, ScriptPositional } from "./help.types.ts";
import { processIo } from "./io.ts";
import type { ScriptIo } from "./io.types.ts";
import { kitOptions, plainLogger, type RunTarget, reportFailure, runTarget } from "./runner.ts";
import { ScriptError, usageError } from "./script.ts";
import type { RunOptions } from "./script.types.ts";
import { supportsColor } from "./style.ts";

/** The settings a definition sets itself, those it leaves out absent, so a group's fill them in. */
const ownSettings = (definition: InheritedSettings): InheritedSettings => ({
  ...(definition.header === undefined ? {} : { header: definition.header }),
  ...(definition.icon === undefined ? {} : { icon: definition.icon }),
  ...(definition.tone === undefined ? {} : { tone: definition.tone }),
  ...(definition.json === undefined ? {} : { json: definition.json }),
  ...(definition.prompts === undefined ? {} : { prompts: definition.prompts }),
  ...(definition.onFailure === undefined ? {} : { onFailure: definition.onFailure })
});

/** What the top of the tree gives every command: how it is run, its name and its version. */
type TopFields = Pick<CommandsDefinition<CommandOptions>, "name" | "command" | "version">;

/**
 * A command's node: its definition, and how it runs once its place in the tree is known.
 *
 * @param definition - The command.
 */
const commandNode = <
  TInherited extends CommandOptions,
  TOwn extends CommandOptions,
  TPositionals extends readonly ScriptPositional[],
  TResult
>(
  definition: CommandDefinition<TInherited, TOwn, TPositionals, TResult>
): CommandNode => {
  const options: CommandOptions = definition.options ?? {};
  const positionals: readonly ScriptPositional[] = definition.positionals ?? [];
  checkOptions(definition.summary, options);
  checkPositionals(definition.summary, positionals);
  return {
    kind: "command",
    summary: definition.summary,
    description: definition.description,
    options,
    positionals,
    examples: definition.examples,
    settings: ownSettings(definition),
    start: (place: CommandPlace, argv: readonly string[], io: ScriptIo): Promise<number> => {
      const { settings } = place;
      const target: RunTarget<TInherited & TOwn, TPositionals> = {
        command: place.command,
        options: { ...place.inherited, ...options },
        allOptions: place.allOptions,
        positionals,
        help: place.help,
        describe: place.describe,
        version: place.version,
        header:
          settings.header === false
            ? false
            : {
                name: place.name,
                summary: definition.summary,
                icon: settings.icon,
                tone: settings.tone,
                version: place.version
              },
        path: place.path,
        run: definition.run,
        onFailure: settings.onFailure
      };
      return runTarget(target, argv, io);
    }
  };
};

/**
 * A group's node: its definition, and its commands made through a scope typed with its options.
 *
 * @param definition - The group.
 */
const groupNode = <TInherited extends CommandOptions, TOwn extends CommandOptions>(
  definition: GroupDefinition<TInherited, TOwn>
): CommandNode => {
  const options: CommandOptions = definition.options ?? {};
  checkOptions(definition.summary, options);
  return {
    kind: "group",
    summary: definition.summary,
    description: definition.description,
    options,
    examples: definition.examples,
    settings: ownSettings(definition),
    aliases: definition.aliases ?? {},
    commands: definition.commands(scopeOf<TInherited & TOwn>())
  };
};

/**
 * The scope a group hands its `commands`: its commands and groups typed with the options above them.
 *
 * @returns The scope.
 */
const scopeOf = <TInherited extends CommandOptions>(): CommandScope<TInherited> => ({
  command: <
    const TOwn extends CommandOptions = NoOptions,
    const TPositionals extends readonly ScriptPositional[] = [],
    TResult = void
  >(
    definition: CommandDefinition<TInherited, TOwn, TPositionals, TResult>
  ): CommandNode => commandNode(definition),
  group: <const TOwn extends CommandOptions = NoOptions>(
    definition: GroupDefinition<TInherited, TOwn>
  ): CommandNode => groupNode(definition)
});

/** A node with its place in the tree, and its help source. */
type PlacedNode = {
  /** The node. */
  readonly node: CommandNode;
  /** Where it sits. */
  readonly place: CommandPlace;
  /** Its help, its commands' included. */
  readonly source: HelpSource;
  /** Its commands by word, placed. */
  readonly commands: ReadonlyMap<string, PlacedNode>;
};

/** What a node inherits from the groups above it, while the tree is built. */
type Ancestry = {
  /** The command words leading to it. */
  readonly path: readonly string[];
  /** The options of the groups above it. */
  readonly inherited: CommandOptions;
  /** Their settings, filled in from the top. */
  readonly settings: InheritedSettings;
};

/**
 * Checks a group's aliases: each names a command of the group, and none is a command's own word.
 *
 * @param command - How the group is called, for the message.
 * @param node - The group.
 * @throws Error at definition time.
 */
const checkAliases = (command: string, node: Extract<CommandNode, { kind: "group" }>): void => {
  for (const [old, current] of Object.entries(node.aliases)) {
    if (!(current in node.commands))
      throw new Error(`${command}: the alias ${old} names no command ${current}`);
    if (old in node.commands) throw new Error(`${command}: ${old} is both a command and an alias`);
  }
};

/**
 * Places a node and everything under it: its full command, its options and settings with its groups', its help.
 *
 * @param definition - The top's definition, for the command, the name and the version.
 * @param node - The node.
 * @param ancestry - What it inherits.
 * @param describe - The whole tree's description, once it is built.
 * @throws Error at definition time when an option is declared twice on one path, or an alias is wrong.
 */
const placeNode = (
  definition: TopFields,
  node: CommandNode,
  ancestry: Ancestry,
  describe: () => string
): PlacedNode => {
  const command = [definition.command, ...ancestry.path].join(" ");
  for (const name of Object.keys(node.options)) {
    if (name in ancestry.inherited)
      throw new Error(`${command}: --${name} is declared by a group above it too`);
  }
  const settings: InheritedSettings = { ...ancestry.settings, ...node.settings };
  const isTop = ancestry.path.length === 0;
  const version = isTop ? definition.version : undefined;
  const kit = kitOptions({
    prompts: node.kind === "command" && settings.prompts,
    json: node.kind === "command" && settings.json,
    version
  });
  const allOptions = mergeOptions(command, { ...ancestry.inherited, ...node.options }, kit);
  const commands = new Map<string, PlacedNode>();
  if (node.kind === "group") {
    checkAliases(command, node);
    const below: Ancestry = {
      path: [],
      inherited: { ...ancestry.inherited, ...node.options },
      settings
    };
    for (const [word, child] of Object.entries(node.commands))
      commands.set(
        word,
        placeNode(definition, child, { ...below, path: [...ancestry.path, word] }, describe)
      );
  }
  const source: HelpSource = {
    name: ancestry.path.at(-1) ?? definition.name,
    command,
    summary: node.summary,
    description: node.description,
    version,
    options: { ...node.options, ...kit },
    positionals: node.kind === "command" ? node.positionals : undefined,
    examples: node.examples,
    inherited: isTop ? undefined : ancestry.inherited,
    commands: [...commands.values()].map((placed) => placed.source),
    aliases: node.kind === "group" ? node.aliases : undefined
  };
  const place: CommandPlace = {
    path: ancestry.path,
    command,
    inherited: ancestry.inherited,
    allOptions,
    settings,
    name: isTop ? definition.name : [definition.name, ...ancestry.path].join(" "),
    version: definition.version,
    help: (color: boolean): string => formatHelp(source, color),
    describe
  };
  return { node, place, source, commands };
};

/** Where the command words lead, and the arguments left for the command reached. */
type Dispatch = {
  /** The node reached. */
  readonly placed: PlacedNode;
  /** The command line without the command words. */
  readonly rest: readonly string[];
  /** The old names used, each with the command it now is. */
  readonly renamed: readonly (readonly [string, string])[];
};

/**
 * The command a group's word names, by its own word or an old one in the group's aliases.
 *
 * @param placed - The group.
 * @param token - The word typed.
 * @returns The command's current word and the command.
 * @throws A usage error naming the unknown word, with the group's commands as the hint.
 */
const commandAt = (
  placed: PlacedNode,
  token: string
): { readonly word: string; readonly next: PlacedNode } => {
  const word =
    placed.commands.has(token) || placed.node.kind !== "group" ? token : placed.node.aliases[token];
  const next = word === undefined ? undefined : placed.commands.get(word);
  if (word === undefined || next === undefined) {
    throw new ScriptError(`unknown command ${token}`, {
      exitCode: EXIT.usage,
      hint: `${placed.place.command} has: ${[...placed.commands.keys()].join(", ")}. Run ${placed.place.command} --help.`
    });
  }
  return { word, next };
};

/**
 * Follows the command words from the start of the command line: options are skipped (and the value of one that takes
 * it), each word goes one level down, until a command is reached or the words run out.
 *
 * @param top - The placed tree.
 * @param argv - The command line.
 * @returns Where it leads.
 * @throws A usage error naming an unknown command word, with the group's commands as the hint.
 */
const dispatch = (top: PlacedNode, argv: readonly string[]): Dispatch => {
  let placed = top;
  const words = new Set<number>();
  const renamed: (readonly [string, string])[] = [];
  for (let index = 0; index < argv.length && placed.node.kind === "group"; index++) {
    const token = argv[index] ?? "";
    if (token === "--") break;
    if (token.startsWith("-") && token !== "-") {
      if (takesValue(token, placed.place.allOptions)) index++;
      continue;
    }
    const { word, next } = commandAt(placed, token);
    if (word !== token) renamed.push([token, word]);
    words.add(index);
    placed = next;
  }
  return { placed, rest: argv.filter((_token, index) => !words.has(index)), renamed };
};

/**
 * What a group prints when it is called without a command: its help with `--help` (or its version with `--version`
 * at the top), a usage error listing its commands otherwise.
 *
 * @param placed - The group reached.
 * @param rest - The rest of the command line.
 * @param io - The run's io.
 * @returns The exit code.
 */
const runGroup = (placed: PlacedNode, rest: readonly string[], io: ScriptIo): number => {
  const { place } = placed;
  let values: ReturnType<typeof parseCommandLine>["values"];
  try {
    values = parseCommandLine(rest, place.allOptions).values;
  } catch (error) {
    return reportFailure(usageError(messageOf(error)), plainLogger(io), place.command);
  }
  if (flag(values["help"])) {
    io.stdout.write(place.help(!flag(values["no-color"]) && supportsColor(io.stdout, io.env)));
    return EXIT.ok;
  }
  if (place.path.length === 0 && place.version && flag(values["version"])) {
    io.stdout.write(`${place.version}\n`);
    return EXIT.ok;
  }
  return reportFailure(
    new ScriptError(`${place.command} needs a command`, {
      exitCode: EXIT.usage,
      hint: `Commands: ${[...placed.commands.keys()].join(", ")}. Run ${place.command} --help.`
    }),
    plainLogger(io),
    place.command
  );
};

/**
 * Describes a command line made of commands; call `.run()` at the end of its file.
 *
 * @param definition - The top group: the command's name, how it is run, its options, version and commands.
 * @returns The runnable command line, with the help and the usage of every command as data.
 * @throws Error at definition time when an option is declared twice on one path, two options share a short alias,
 * an option clashes with a common one, the positionals are out of order, or an alias names no command.
 * @example
 * ```ts
 * await defineCommands({
 *   name: "radar-kb",
 *   command: "radar-kb",
 *   summary: "Notes and plans of the project's knowledge",
 *   options: { project: { type: "string", description: "The project." } },
 *   commands: (kb) => ({
 *     note: kb.group({
 *       summary: "The notes",
 *       commands: (note) => ({
 *         add: note.command({ summary: "Add a note", run: ({ options, log }) => log.info(options.project ?? "") })
 *       })
 *     })
 *   })
 * }).run();
 * ```
 */
export const defineCommands = <const TOwn extends CommandOptions = NoOptions>(
  definition: CommandsDefinition<TOwn>
): Commands => {
  const top = groupNode<NoOptions, TOwn>(definition);
  const describe = (): string => formatJson(formatHelpJson(placed.source));
  const placed = placeNode(
    definition,
    top,
    { path: [], inherited: {}, settings: { header: true, ...top.settings } },
    describe
  );
  const run = async (argv?: readonly string[], options: RunOptions = {}): Promise<number> => {
    const io = options.io ?? processIo();
    const finish = (code: number): number => {
      io.setExitCode(code);
      return code;
    };
    if (io.env[ENV.describe] === "1") {
      io.stdout.write(describe());
      return finish(EXIT.ok);
    }
    let reached: Dispatch;
    try {
      reached = dispatch(placed, argv ?? io.argv);
    } catch (error) {
      return finish(reportFailure(error, plainLogger(io), definition.command));
    }
    for (const [old, current] of reached.renamed) plainLogger(io).warn(`${old} is now ${current}`);
    const { node, place } = reached.placed;
    if (node.kind === "group") return finish(runGroup(reached.placed, reached.rest, io));
    return node.start(place, reached.rest, io);
  };
  return {
    run,
    help: (color = false): string => formatHelp(placed.source, color),
    markdown: (): string => formatHelpMarkdown(placed.source),
    source: placed.source
  };
};
