/**
 * `checks()`: the report of a doctor command. Named checks grouped in sections, one line each with its status's glyph
 * and tone, what to do under the ones that are not fine, and a summary line; the same data for `--json`, and the exit
 * code (failure when a check failed; warnings never fail).
 *
 * @remarks
 * The checks themselves run in the script (with `tasks()` for the live progress while they run); this module only
 * renders and judges what they found. The text goes to stdout: it is the command's result.
 *
 * @example
 * ```ts
 * run: async ({ io, style, isJson }) => {
 *   const sections = [{ title: "Tools", checks: [await checkTmux(io)] }];
 *   io.stdout.write(isJson ? formatJson(checksJson(sections)) : checks(sections, style));
 *   const exitCode = checksExitCode(sections);
 *   // the report is printed: the run ends with its code and no other message
 *   if (exitCode !== EXIT.ok) throw new ScriptError("some checks failed", { exitCode, isReported: true });
 * }
 * ```
 *
 * @module
 */
import type { Check, CheckCounts, CheckRecord, CheckSection, CheckStatus } from "./checks.types.ts";
import { EXIT, SYMBOLS } from "./constants.ts";
import { plural } from "./format.ts";
import { glyph } from "./glyphs.ts";
import type { GlyphName } from "./glyphs.types.ts";
import type { OutputStyle } from "./log.types.ts";
import { paint } from "./style.ts";
import type { Tone } from "./style.types.ts";

/** The glyph and tone of each status. */
const LOOK: Readonly<Record<CheckStatus, { readonly glyph: GlyphName; readonly tone: Tone }>> = {
  ok: { glyph: "success", tone: "success" },
  warn: { glyph: "warning", tone: "warning" },
  fail: { glyph: "error", tone: "danger" },
  skip: { glyph: "skipped", tone: "muted" }
};

/** The statuses in the summary's order, each with its noun. */
const SUMMARY: readonly (readonly [CheckStatus, string, string])[] = [
  ["ok", "ok", "ok"],
  ["warn", "warning", "warnings"],
  ["fail", "problem", "problems"],
  ["skip", "skipped", "skipped"]
];

/**
 * How many checks came out each way.
 *
 * @param sections - The report.
 * @returns The count of each status.
 */
export const checkCounts = (sections: readonly CheckSection[]): CheckCounts => {
  const counts: Record<CheckStatus, number> = { ok: 0, warn: 0, fail: 0, skip: 0 };
  for (const section of sections) for (const check of section.checks) counts[check.status] += 1;
  return counts;
};

/** One check's lines: its status, name and detail; what to do under it. */
const checkLines = (check: Check, style: OutputStyle): string[] => {
  const look = LOOK[check.status];
  const mark = paint(look.tone, glyph(look.glyph, style.unicode), style.color);
  const separator = SYMBOLS.separator[style.unicode ? "unicode" : "ascii"];
  const line = `  ${mark} ${check.name} ${paint("muted", separator, style.color)} ${check.detail}`;
  if (check.fix === undefined) return [line];
  const arrow = glyph("step", style.unicode);
  const fix = "hint" in check.fix ? check.fix.hint : `run: ${check.fix.command}`;
  return [line, `    ${paint("muted", `${arrow} ${fix}`, style.color)}`];
};

/**
 * The summary line: each status that occurred, counted (`12 ok, 1 warning, 1 problem`).
 *
 * @param sections - The report.
 * @param style - Colours.
 */
const summaryLine = (sections: readonly CheckSection[], style: OutputStyle): string => {
  const counts = checkCounts(sections);
  const parts = SUMMARY.filter(([status]) => counts[status] > 0).map(([status, one, many]) =>
    paint(LOOK[status].tone, plural(counts[status], one, many), style.color)
  );
  return parts.length === 0 ? paint("muted", "nothing checked", style.color) : parts.join(", ");
};

/**
 * The report as text: each section's title and its checks, then the summary line.
 *
 * @param sections - The checks, grouped.
 * @param style - Colours and glyphs (the script's `context.style`).
 * @returns The text, ending with a newline.
 */
export const checks = (sections: readonly CheckSection[], style: OutputStyle): string => {
  const lines = sections.flatMap((section) => [
    paint("strong", section.title, style.color),
    ...section.checks.flatMap((check) => checkLines(check, style)),
    ""
  ]);
  return `${[...lines, summaryLine(sections, style)].join("\n")}\n`;
};

/**
 * The report as data, for `--json`: every check with its section, in order.
 *
 * @param sections - The checks, grouped.
 * @returns One record per check.
 */
export const checksJson = (sections: readonly CheckSection[]): CheckRecord[] =>
  sections.flatMap((section) =>
    section.checks.map((check) => ({
      section: section.title,
      name: check.name,
      status: check.status,
      detail: check.detail,
      fix: check.fix ?? null
    }))
  );

/**
 * The exit code of a report: failure when a check failed, success otherwise (a warning never fails).
 *
 * @param sections - The checks, grouped.
 * @returns `EXIT.ok` or `EXIT.failure`.
 */
export const checksExitCode = (sections: readonly CheckSection[]): number =>
  checkCounts(sections).fail > 0 ? EXIT.failure : EXIT.ok;
