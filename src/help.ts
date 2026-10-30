/**
 * Generates a script's help from its definition, so the usage is written once, as data, and never drifts from the
 * options the script really accepts.
 *
 * @remarks
 * The terminal text for `--help` and Markdown for the docs; the man page, JSON and shell completions are in
 * `docs.ts`. All of them share the labels built here.
 *
 * @module
 */
import type { HelpSource, ScriptOption, ScriptPositional } from "./help.types.ts";
import { escapeMarkdown, escapeTableCell } from "./markdown.ts";
import { paint } from "./style.ts";

/**
 * How an option's value appears after its name: ` <ref>` when required, `[=<when>]` when optional, nothing for a flag.
 *
 * @param option - The declaration.
 * @returns The value part of the label.
 */
export const optionValueLabel = (option: ScriptOption): string => {
  if (option.type === "boolean") return "";
  const name = option.valueName ?? defaultValueName(option);
  return option.value === "optional" ? `[=<${name}>]` : ` <${name}>`;
};

/**
 * The placeholder of an option's value when it names none: `number` for a number option, `value` otherwise.
 *
 * @param option - The declaration.
 * @returns The placeholder.
 */
export const defaultValueName = (option: ScriptOption): string =>
  option.type === "number" ? "number" : "value";

/**
 * A number option's range as the help shows it: `0-600`, `at least 0`, `at most 600`, and `whole number`.
 *
 * @param option - The declaration.
 * @returns The facts, none for an option without them.
 */
const numberFacts = (option: ScriptOption): string[] => {
  const facts: string[] = [];
  if (option.min !== undefined && option.max !== undefined) facts.push(`${option.min}-${option.max}`);
  else if (option.min !== undefined) facts.push(`at least ${option.min}`);
  else if (option.max !== undefined) facts.push(`at most ${option.max}`);
  if (option.integer) facts.push("whole number");
  return facts;
};

/**
 * The left column of an option row: `-c, --check` or `    --base <ref>`.
 *
 * @param name - The option's long name.
 * @param option - Its declaration.
 * @returns The label, with four spaces in place of a missing short alias.
 */
export const optionLabel = (name: string, option: ScriptOption): string => {
  const short = option.short ? `-${option.short}, ` : "    ";
  return `${short}--${name}${optionValueLabel(option)}`;
};

/**
 * The facts about an option that its description leaves out: environment variable, default and choices.
 *
 * @param option - The declaration.
 * @returns The facts in parentheses (`(env: RADAR_TOKEN, default: 4747)`), or an empty string.
 */
export const optionFacts = (option: ScriptOption): string => {
  const facts: string[] = [];
  if (option.required) facts.push("required");
  if (option.value === "optional" && option.impliedValue) facts.push(`alone: ${option.impliedValue}`);
  if (option.choices && option.choices.length > 0) facts.push(`one of: ${option.choices.join(", ")}`);
  facts.push(...numberFacts(option));
  if (option.default !== undefined) facts.push(`default: ${option.default}`);
  if (option.env) facts.push(`env: ${option.env}`);
  return facts.length > 0 ? `(${facts.join("; ")})` : "";
};

/**
 * How a positional appears in the usage line: `<file>` when required, `[file]` when not, `…` when variadic or raw.
 *
 * @param positional - The declaration.
 * @returns The usage token.
 */
export const positionalLabel = (positional: ScriptPositional): string => {
  const name = positional.variadic || positional.raw ? `${positional.name}...` : positional.name;
  return positional.required ? `<${name}>` : `[${name}]`;
};

/**
 * The usage line.
 *
 * @param source - The script's definition.
 * @returns `command [options] <arg> [arg]`.
 */
export const usageLine = (source: HelpSource): string =>
  [
    source.command,
    ...(isGroup(source) ? ["<command>"] : []),
    "[options]",
    ...(source.positionals ?? []).map(positionalLabel)
  ].join(" ");

/**
 * Whether a help source is a group of commands: it has commands, and runs none of its own.
 *
 * @param source - The definition.
 * @returns Whether the source lists commands.
 */
export const isGroup = (source: HelpSource): boolean => (source.commands ?? []).length > 0;

/**
 * The aliases of a group as one line each: the old name and the command it now is.
 *
 * @param source - The group.
 * @returns The rows, or none.
 */
const aliasRows = (source: HelpSource): (readonly [string, string])[] =>
  Object.entries(source.aliases ?? {}).map(([old, current]) => [old, `now ${current}`] as const);

/** Rows padded into two columns. */
const twoColumns = (rows: readonly (readonly [string, string])[]): string[] => {
  const width = Math.max(0, ...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`.trimEnd());
};

/** A description followed by its facts, the facts muted. */
const describe = (description: string, facts: string, color: boolean): string =>
  facts ? `${description} ${paint("muted", facts, color)}` : description;

/**
 * The text printed by `--help`.
 *
 * @param source - The script's definition.
 * @param color - Whether to colour headings and facts.
 * @returns The help text, ending with a newline.
 */
export const formatHelp = (source: HelpSource, color: boolean): string => {
  const heading = (text: string): string => paint("strong", text, color);
  const title = source.version ? `${source.name} ${paint("muted", source.version, color)}` : source.name;
  const lines = [`${heading(title)} — ${source.summary}`, ""];
  if (source.description) lines.push(source.description, "");
  lines.push(heading("Usage"), `  ${usageLine(source)}`, "");
  if (source.positionals && source.positionals.length > 0) {
    const rows = source.positionals.map(
      (p) =>
        [
          p.name,
          describe(p.description, p.choices ? `(one of: ${p.choices.join(", ")})` : "", color)
        ] as const
    );
    lines.push(heading("Arguments"), ...twoColumns(rows), "");
  }
  if (isGroup(source)) {
    const commandRows = (source.commands ?? []).map((command) => [command.name, command.summary] as const);
    lines.push(heading("Commands"), ...twoColumns(commandRows), "");
    const aliases = aliasRows(source);
    if (aliases.length > 0) lines.push(heading("Renamed"), ...twoColumns(aliases), "");
  }
  const optionRows = (options: HelpSource["options"]): (readonly [string, string])[] =>
    Object.entries(options).map(
      ([name, option]) =>
        [optionLabel(name, option), describe(option.description, optionFacts(option), color)] as const
    );
  lines.push(heading("Options"), ...twoColumns(optionRows(source.options)), "");
  if (source.inherited && Object.keys(source.inherited).length > 0) {
    lines.push(heading("Inherited options"), ...twoColumns(optionRows(source.inherited)), "");
  }
  if (source.examples && source.examples.length > 0) {
    lines.push(
      heading("Examples"),
      ...twoColumns(source.examples.map((e) => [e.command, e.description] as const)),
      ""
    );
  }
  if (isGroup(source))
    lines.push(paint("muted", `Run ${source.command} <command> --help for a command's options.`, color), "");
  return lines.join("\n");
};

/**
 * The same help as Markdown, for a README or the docs.
 *
 * @param source - The script's definition.
 * @returns Markdown, starting with a `###` heading.
 */
export const formatHelpMarkdown = (source: HelpSource): string => commandMarkdown(source, source.name);

/**
 * The Markdown of one command, then of each command under it, every one titled by how it is called.
 *
 * @param source - The command's definition.
 * @param title - Its heading: the script's name, or a subcommand's whole command (`radar-kb note add`).
 * @returns Markdown, starting with a `###` heading.
 */
const commandMarkdown = (source: HelpSource, title: string): string => {
  const lines = [
    `### \`${title}\``,
    "",
    escapeMarkdown(source.summary),
    "",
    ...(source.description ? [escapeMarkdown(source.description), ""] : []),
    "```",
    usageLine(source),
    "```",
    "",
    ...commandRowsMarkdown(source),
    ...positionalRowsMarkdown(source),
    ...optionRowsMarkdown(source),
    ...(source.examples && source.examples.length > 0
      ? [
          "",
          "Examples:",
          "",
          ...source.examples.map(
            (example) => `- \`${example.command}\`: ${escapeMarkdown(example.description)}`
          )
        ]
      : [])
  ];
  const children = (source.commands ?? []).map((command) => commandMarkdown(command, command.command));
  return [`${lines.join("\n")}\n`, ...children].join("\n");
};

/** A group's commands and renamed words as a Markdown table; nothing for a command that runs. */
const commandRowsMarkdown = (source: HelpSource): string[] =>
  isGroup(source)
    ? [
        "| Command | What it does |",
        "|---|---|",
        ...(source.commands ?? []).map(
          (command) => `| \`${command.name}\` | ${escapeTableCell(command.summary)} |`
        ),
        ...Object.entries(source.aliases ?? {}).map(
          ([old, current]) => `| \`${old}\` | ${escapeTableCell(`now ${current}`)} |`
        ),
        ""
      ]
    : [];

/** The positionals as a Markdown table; nothing without any. */
const positionalRowsMarkdown = (source: HelpSource): string[] =>
  source.positionals && source.positionals.length > 0
    ? [
        "| Argument | What it is |",
        "|---|---|",
        ...source.positionals.map((positional) => {
          const choices = positional.choices ? ` (one of: ${positional.choices.join(", ")})` : "";
          return `| \`${positionalLabel(positional)}\` | ${escapeTableCell(`${positional.description}${choices}`)} |`;
        }),
        ""
      ]
    : [];

/** The options as a Markdown table, the inherited ones last and marked. */
const optionRowsMarkdown = (source: HelpSource): string[] => {
  const rows = [
    ...Object.entries(source.options).map(([name, option]) => [name, option, false] as const),
    ...Object.entries(source.inherited ?? {}).map(([name, option]) => [name, option, true] as const)
  ];
  return [
    "| Option | What it does |",
    "|---|---|",
    ...rows.map(([name, option, isInherited]) => {
      const facts = [optionFacts(option), isInherited ? "(inherited)" : ""].filter(Boolean).join(" ");
      const text = facts ? `${option.description} ${facts}` : option.description;
      return `| \`${optionLabel(name, option).trim()}\` | ${escapeTableCell(text)} |`;
    })
  ];
};
