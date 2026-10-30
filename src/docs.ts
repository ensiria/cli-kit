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
import type { OptionDescription, ScriptDescription, Shell } from "./docs.types.ts";
import { optionFacts, optionValueLabel, positionalLabel, usageLine } from "./help.ts";
import type { HelpSource } from "./help.types.ts";

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
  options: Object.entries(source.options).map(
    ([name, option]): OptionDescription => ({
      name,
      type: option.type,
      description: option.description,
      short: option.short ?? null,
      valueName: option.type === "string" ? (option.valueName ?? "value") : null,
      multiple: option.multiple ?? false,
      default: option.default ?? null,
      choices: option.choices ?? null,
      env: option.env ?? null,
      required: option.required ?? false,
      value: option.type === "string" ? (option.value ?? "required") : null,
      impliedValue: option.value === "optional" ? (option.impliedValue ?? "") : null
    })
  ),
  positionals: (source.positionals ?? []).map((positional) => ({
    name: positional.name,
    description: positional.description,
    required: positional.required ?? false,
    variadic: positional.variadic ?? false,
    choices: positional.choices ?? null
  })),
  examples: (source.examples ?? []).map(({ command, description }) => ({ command, description }))
});

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

/** The OPTIONS section. */
const manOptions = (source: HelpSource): string[] =>
  Object.entries(source.options).flatMap(([name, option]) => {
    const flags = [option.short ? `-${option.short}` : "", `--${name}`].filter(Boolean).join(", ");
    const facts = optionFacts(option);
    return manEntry(
      `${flags}${optionValueLabel(option)}`,
      facts ? `${option.description} ${facts}` : option.description
    );
  });

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
    ".SH OPTIONS",
    ...manOptions(source),
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
      option.type === "string"
        ? `:${option.valueName ?? "value"}:${option.choices ? `(${option.choices.join(" ")})` : "_files"}`
        : "";
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
 * Shell completions for a command: its options, the choices of options and positionals, files for other values.
 *
 * @param source - The script's definition.
 * @param shell - Which shell.
 * @param command - The name the command is installed as. @defaultValue the script's name
 * @returns The completion script, to source or to put in the shell's completion folder.
 */
export const formatCompletion = (source: HelpSource, shell: Shell, command: string = source.name): string =>
  COMPLETIONS[shell](source, command);
