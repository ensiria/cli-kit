/**
 * More formats generated from a script's definition: a man page (roff), a JSON description, and shell completions
 * for bash, zsh and fish.
 *
 * @remarks
 * With `--help` and the Markdown of `help.ts`, every place that documents a script comes from the same data, so
 * none of them is written by hand or drifts. A script prints its JSON description, without running, when
 * `CLI_KIT_DESCRIBE=1` is set: that is how `cli-kit docs` collects the scripts of `scripts.json`.
 *
 * @module
 */
import { formatTreeCompletion } from "./commandCompletions.ts";
import type { OptionDescription, ScriptDescription, Shell } from "./docs.types.ts";
import {
  defaultValueName,
  isGroup,
  optionFacts,
  optionValueLabel,
  positionalLabel,
  usageLine
} from "./help.ts";
import type { HelpSource } from "./help.types.ts";

/**
 * Options as data, in their declared order.
 *
 * @param options - The declarations, by long name.
 */
const optionDescriptions = (options: HelpSource["options"]): OptionDescription[] =>
  Object.entries(options).map(([name, option]) => optionDescription(name, option));

/**
 * One option as data, absent fields `null` (or `false`).
 *
 * @param name - Its long name.
 * @param option - Its declaration.
 */
const optionDescription = (name: string, option: HelpSource["options"][string]): OptionDescription => ({
  name,
  type: option.type,
  description: option.description,
  short: option.short ?? null,
  ...valueDescription(option),
  multiple: option.multiple ?? false,
  default: option.default ?? null,
  min: option.min ?? null,
  max: option.max ?? null,
  integer: option.integer ?? false,
  valueFrom: option.valueFrom ?? false,
  choices: option.choices ?? null,
  env: option.env ?? null,
  required: option.required ?? false
});

/**
 * An option's value fields as data: its placeholder and whether its value is required or optional, all `null` for a
 * boolean.
 *
 * @param option - The declaration.
 */
const valueDescription = (
  option: HelpSource["options"][string]
): Pick<OptionDescription, "valueName" | "value" | "impliedValue"> =>
  option.type === "boolean"
    ? { valueName: null, value: null, impliedValue: null }
    : {
        valueName: option.valueName ?? defaultValueName(option),
        value: option.value ?? "required",
        impliedValue: option.value === "optional" ? (option.impliedValue ?? "") : null
      };

/**
 * A script as data, for tools (docs generators, completions, other programs).
 *
 * @param source - The script's definition (`script.source`).
 * @returns The description; absent fields are `null` so the shape is fixed.
 */
export const formatHelpJson = (source: HelpSource): ScriptDescription => ({
  schema: 1,
  name: source.name,
  command: source.command,
  summary: source.summary,
  description: source.description ?? null,
  version: source.version ?? null,
  options: optionDescriptions(source.options),
  positionals: (source.positionals ?? []).map((positional) => ({
    name: positional.name,
    description: positional.description,
    required: positional.required ?? false,
    variadic: positional.variadic ?? false,
    valueFrom: positional.valueFrom ?? false,
    choices: positional.choices ?? null
  })),
  examples: (source.examples ?? []).map(({ command, description }) => ({ command, description })),
  inheritedOptions: optionDescriptions(source.inherited ?? {}),
  commands: (source.commands ?? []).map(formatHelpJson),
  aliases: source.aliases ?? {}
});

/** What zsh offers for an option's value: its choices, nothing for a number, files otherwise. */
const zshValueAction = (option: HelpSource["options"][string]): string => {
  if (option.choices) return `(${option.choices.join(" ")})`;
  return option.type === "number" ? " " : "_files";
};

/** Escapes text for roff: backslashes, dashes, and a dot or quote at the start of a line. */
const roff = (text: string): string =>
  text
    .replaceAll("\\", "\\e")
    .replaceAll("-", "\\-")
    .split("\n")
    .map((line) => (/^[.']/.test(line) ? `\\&${line}` : line))
    .join("\n");

/** A `.TP` entry: a bold term and its text. */
const manEntry = (term: string, text: string): string[] => [".TP", `.B ${roff(term)}`, roff(text)];

/** The OPTIONS section's entries: the options given, by long name. */
const manOptions = (options: HelpSource["options"]): string[] =>
  Object.entries(options).flatMap(([name, option]) => {
    const flags = [option.short ? `-${option.short}` : "", `--${name}`].filter(Boolean).join(", ");
    const facts = optionFacts(option);
    return manEntry(
      `${flags}${optionValueLabel(option)}`,
      facts ? `${option.description} ${facts}` : option.description
    );
  });

/**
 * The COMMANDS section: every command under a group, at any depth, with its usage, summary and own options.
 *
 * @param source - The group.
 */
const manCommands = (source: HelpSource): string[] =>
  (source.commands ?? []).flatMap((command) => [
    `.SS "${roff(command.command)}"`,
    roff(command.summary),
    ".PP",
    roff(usageLine(command)),
    ...manOptions(
      Object.fromEntries(Object.entries(command.options).filter(([name]) => !(name in source.options)))
    ),
    ...manCommands(command)
  ]);

/**
 * The man page, in roff (`man ./name.1` shows it).
 *
 * @param source - The script's definition.
 * @returns The page, section 1.
 */
export const formatHelpMan = (source: HelpSource): string => {
  const positionals = source.positionals ?? [];
  const examples = source.examples ?? [];
  const lines = [
    `.TH "${source.name.toUpperCase()}" "1" "" "${source.version ?? ""}" "${roff(source.summary)}"`,
    ".SH NAME",
    `${roff(source.name)} \\- ${roff(source.summary)}`,
    ".SH SYNOPSIS",
    roff(usageLine(source)),
    ...(source.description ? [".SH DESCRIPTION", roff(source.description)] : []),
    ...(positionals.length > 0 ? [".SH ARGUMENTS"] : []),
    ...positionals.flatMap((positional) => manEntry(positionalLabel(positional), positional.description)),
    ...(isGroup(source) ? [".SH COMMANDS", ...manCommands(source)] : []),
    ".SH OPTIONS",
    ...manOptions(source.options),
    ...(source.inherited && Object.keys(source.inherited).length > 0
      ? [".SH INHERITED OPTIONS", ...manOptions(source.inherited)]
      : []),
    ...(examples.length > 0 ? [".SH EXAMPLES"] : []),
    ...examples.flatMap((example) => manEntry(example.command, example.description))
  ];
  return `${lines.join("\n")}\n`;
};

/** Quotes text for a single-quoted shell string. */
const quote = (text: string): string => `'${text.replaceAll("'", `'\\''`)}'`;

/** A shell function name from a command name. */
const functionName = (command: string): string => `_${command.replace(/[^A-Za-z0-9_]/g, "_")}`;

/** bash: a completion function over the option names, with the choices of the previous option. */
const bashCompletion = (source: HelpSource, command: string): string => {
  const words = Object.entries(source.options).flatMap(([name, option]) =>
    option.short ? [`--${name}`, `-${option.short}`] : [`--${name}`]
  );
  const positionalChoices = (source.positionals ?? []).flatMap((positional) => positional.choices ?? []);
  const cases = Object.entries(source.options)
    .filter(([, option]) => option.choices && option.choices.length > 0)
    .map(([name, option]) => {
      const flags = [`--${name}`, ...(option.short ? [`-${option.short}`] : [])].join("|");
      return `    ${flags}) COMPREPLY=($(compgen -W ${quote((option.choices ?? []).join(" "))} -- "$cur")); return ;;`;
    });
  const fn = functionName(command);
  return [
    `# bash completion for ${command} (generated by @ensiria/cli-kit)`,
    `${fn}() {`,
    // biome-ignore lint/suspicious/noTemplateCurlyInString: bash parameter expansion, not a template
    '  local cur="${COMP_WORDS[COMP_CWORD]}" prev="${COMP_WORDS[COMP_CWORD-1]}"',
    '  case "$prev" in',
    ...cases,
    "  esac",
    `  COMPREPLY=($(compgen -W ${quote([...words, ...positionalChoices].join(" "))} -- "$cur"))`,
    "}",
    `complete -F ${fn} ${command}`,
    ""
  ].join("\n");
};

/** zsh: an `_arguments` spec per option and positional. */
const zshCompletion = (source: HelpSource, command: string): string => {
  const zshEscape = (text: string): string =>
    text.replaceAll("'", "'\\''").replaceAll("[", "\\[").replaceAll("]", "\\]").replaceAll(":", "\\:");
  const specs = Object.entries(source.options).map(([name, option]) => {
    const equals = option.value === "optional" ? "=-" : "";
    const flags = option.short ? `{-${option.short},--${name}${equals}}` : `--${name}${equals}`;
    const exclusive = option.short ? `'(-${option.short} --${name})'` : "";
    const value =
      option.type === "boolean"
        ? ""
        : `:${option.valueName ?? defaultValueName(option)}:${zshValueAction(option)}`;
    const repeat = option.multiple ? "'*'" : "";
    return `    ${repeat}${exclusive}${flags}'[${zshEscape(option.description)}]${value}'`;
  });
  const positionals = (source.positionals ?? []).map((positional, index) => {
    const position = positional.variadic ? "'*" : `'${index + 1}`;
    const action = positional.choices ? `(${positional.choices.join(" ")})` : "_files";
    return `    ${position}:${zshEscape(positional.name)}:${action}'`;
  });
  return [
    `#compdef ${command}`,
    `# zsh completion for ${command} (generated by @ensiria/cli-kit)`,
    `${functionName(command)}() {`,
    "  _arguments -s \\",
    [...specs, ...positionals].join(" \\\n"),
    "}",
    `${functionName(command)} "$@"`,
    ""
  ].join("\n");
};

/** fish: one `complete` line per option, plus the positionals' choices. */
const fishCompletion = (source: HelpSource, command: string): string => {
  const lines = Object.entries(source.options).map(([name, option]) => {
    const parts = [`complete -c ${command}`, `-l ${name}`];
    if (option.short) parts.push(`-s ${option.short}`);
    if (option.type === "string")
      parts.push(option.choices ? `-x -a ${quote(option.choices.join(" "))}` : "-r");
    if (option.type === "number") parts.push("-x");
    parts.push(`-d ${quote(option.description)}`);
    return parts.join(" ");
  });
  for (const positional of source.positionals ?? []) {
    if (positional.choices) {
      lines.push(
        `complete -c ${command} -f -a ${quote(positional.choices.join(" "))} -d ${quote(positional.description)}`
      );
    }
  }
  return [`# fish completion for ${command} (generated by @ensiria/cli-kit)`, ...lines, ""].join("\n");
};

/** The writer for each shell. */
const COMPLETIONS: Readonly<Record<Shell, (source: HelpSource, command: string) => string>> = {
  bash: bashCompletion,
  zsh: zshCompletion,
  fish: fishCompletion
};

/** The shells completions can be written for. */
export const SHELLS: readonly Shell[] = ["bash", "zsh", "fish"];

/**
 * Shell completions for a command: its options, the choices of options and positionals, files for other values; for a
 * command made of subcommands, the command words first, then the options of the command they lead to.
 *
 * @param source - The script's definition.
 * @param shell - Which shell.
 * @param command - The name the command is installed as. @defaultValue the script's name
 * @returns The completion script, to source or to put in the shell's completion folder.
 */
export const formatCompletion = (source: HelpSource, shell: Shell, command: string = source.name): string =>
  isGroup(source) ? formatTreeCompletion(source, shell, command) : COMPLETIONS[shell](source, command);
