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
  const name = option.valueName ?? "value";
  return option.value === "optional" ? `[=<${name}>]` : ` <${name}>`;
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
  [source.command, "[options]", ...(source.positionals ?? []).map(positionalLabel)].join(" ");

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
  const optionRows = Object.entries(source.options).map(
    ([name, option]) =>
      [optionLabel(name, option), describe(option.description, optionFacts(option), color)] as const
  );
  lines.push(heading("Options"), ...twoColumns(optionRows), "");
  if (source.examples && source.examples.length > 0) {
    lines.push(
      heading("Examples"),
      ...twoColumns(source.examples.map((e) => [e.command, e.description] as const)),
      ""
    );
  }
  return lines.join("\n");
};

/**
 * The same help as Markdown, for a README or the docs.
 *
 * @param source - The script's definition.
 * @returns Markdown, starting with a `###` heading.
 */
export const formatHelpMarkdown = (source: HelpSource): string => {
  const lines = [`### \`${source.name}\``, "", escapeMarkdown(source.summary), ""];
  if (source.description) lines.push(escapeMarkdown(source.description), "");
  lines.push("```", usageLine(source), "```", "");
  if (source.positionals && source.positionals.length > 0) {
    lines.push("| Argument | What it is |", "|---|---|");
    for (const positional of source.positionals) {
      const choices = positional.choices ? ` (one of: ${positional.choices.join(", ")})` : "";
      lines.push(
        `| \`${positionalLabel(positional)}\` | ${escapeTableCell(`${positional.description}${choices}`)} |`
      );
    }
    lines.push("");
  }
  lines.push("| Option | What it does |", "|---|---|");
  for (const [name, option] of Object.entries(source.options)) {
    const facts = optionFacts(option);
    lines.push(
      `| \`${optionLabel(name, option).trim()}\` | ${escapeTableCell(facts ? `${option.description} ${facts}` : option.description)} |`
    );
  }
  if (source.examples && source.examples.length > 0) {
    lines.push("", "Examples:", "");
    for (const example of source.examples)
      lines.push(`- \`${example.command}\`: ${escapeMarkdown(example.description)}`);
  }
  return `${lines.join("\n")}\n`;
};
