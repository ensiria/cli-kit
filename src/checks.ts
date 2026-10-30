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
 * run: async ({ io, log, style, isJson, onExit }) => {
 *   const report = await runChecks(
 *     [{ title: "Tools", checks: [{ name: "git", run: () => checkProgram({ program: "git", minimum: "2.39" }, io) }] }],
 *     { io, log, onExit }
 *   );
 *   reportChecks(report, { io, style, isJson });
 * }
 * ```
 *
 * @module
 */
import type {
  Check,
  CheckCounts,
  CheckGroup,
  CheckRecord,
  CheckSection,
  CheckStatus,
  CheckToRun,
  ProgramCheckOptions
} from "./checks.types.ts";
import { EXIT, SYMBOLS } from "./constants.ts";
import { exec } from "./exec.ts";
import { formatJson } from "./files.ts";
import { plural } from "./format.ts";
import { glyph } from "./glyphs.ts";
import type { GlyphName } from "./glyphs.types.ts";
import type { ScriptIo } from "./io.types.ts";
import { canAnimate } from "./live.ts";
import type { LiveTarget } from "./live.types.ts";
import type { OutputStyle } from "./log.types.ts";
import { ScriptError } from "./script.ts";
import { paint } from "./style.ts";
import type { Tone } from "./style.types.ts";
import { tasks } from "./tasks.ts";
import type { TaskHandle } from "./tasks.types.ts";
import { compareVersions, formatVersion, parseVersion } from "./version.ts";

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

/**
 * Checks that a program is installed, at a minimum version: runs it with its version arguments and reads the version
 * it prints.
 *
 * @param options - The program, its name in the report, its version arguments, the minimum, whether it is required,
 * and the fix.
 * @param io - The script's io (`context.io`): its tests answer instead of real programs.
 * @returns The check: `ok` with the version; `fail` (or `warn` when not required) when it is missing, older than the
 * minimum, or prints no version a minimum can be compared with.
 * @example
 * ```ts
 * await checkProgram({ program: "git", minimum: "2.39", fix: { command: "brew install git" } }, io);
 * ```
 */
export const checkProgram = async (options: ProgramCheckOptions, io: ScriptIo): Promise<Check> => {
  const name = options.name ?? options.program;
  const problem: CheckStatus = options.isRequired === false ? "warn" : "fail";
  const withFix = (check: Check): Check =>
    options.fix === undefined ? check : { ...check, fix: options.fix };
  let printed: string;
  try {
    const result = await exec(options.program, options.args ?? ["--version"], { check: false, io });
    printed = `${result.stdout}\n${result.stderr}`;
  } catch {
    return withFix({ name, status: problem, detail: "not installed, or not on the PATH" });
  }
  const version = parseVersion(printed);
  const found = version === undefined ? (printed.trim().split("\n")[0] ?? "") : formatVersion(version);
  if (options.minimum === undefined) return { name, status: "ok", detail: found || "installed" };
  if (version === undefined) {
    return withFix({ name, status: problem, detail: `prints no version to compare with ${options.minimum}` });
  }
  const minimum = parseVersion(options.minimum);
  if (minimum !== undefined && compareVersions(version, minimum) < 0) {
    return withFix({ name, status: problem, detail: `${found}, needs ${options.minimum} or later` });
  }
  return { name, status: "ok", detail: found };
};

/**
 * One check run: what it returns, or a failure saying it could not be checked when it throws, so one broken check
 * never stops the report.
 *
 * @param check - The check to run.
 */
const runOne = async (check: CheckToRun): Promise<Check> => {
  try {
    return await check.run();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { name: check.name, status: "fail", detail: `could not be checked: ${reason}` };
  }
};

/**
 * Runs a doctor's checks, section by section, and gathers the report: on a terminal with a live list of what runs
 * (`tasks()`), silently otherwise, so the report is the only output of a pipe or CI. A check that throws is a failed
 * check, the others still run.
 *
 * @param groups - The sections, each with its checks.
 * @param target - Where the progress is drawn (the script's `{ io, log, onExit }`).
 * @returns The report, for `checks()`, `checksJson()` and `checksExitCode()`.
 * @example
 * ```ts
 * const report = await runChecks(
 *   [{ title: "Tools", checks: [{ name: "git", run: () => checkProgram({ program: "git" }, io) }] }],
 *   { io, log, onExit }
 * );
 * ```
 */
export const runChecks = async (
  groups: readonly CheckGroup[],
  target: LiveTarget
): Promise<CheckSection[]> => {
  const found = groups.map((group) => group.checks.map((): Check | undefined => undefined));
  if (!canAnimate(target)) {
    return Promise.all(
      groups.map(async (group) => ({
        title: group.title,
        checks: await Promise.all(group.checks.map(runOne))
      }))
    );
  }
  await tasks(
    groups.map((group, groupIndex) => ({
      title: group.title,
      children: group.checks.map((check, checkIndex) => ({
        title: check.name,
        run: async (task: TaskHandle): Promise<void> => {
          const result = await runOne(check);
          task.setDetail(result.detail);
          const row = found[groupIndex];
          if (row) row[checkIndex] = result;
        }
      }))
    })),
    target
  );
  return groups.map((group, groupIndex) => ({
    title: group.title,
    checks: group.checks.map(
      (check, checkIndex): Check =>
        found[groupIndex]?.[checkIndex] ?? { name: check.name, status: "skip", detail: "not run" }
    )
  }));
};

/**
 * Prints a doctor's report and ends the run with its code: the report (its JSON with `--json`) on stdout, then, when
 * a check failed, a reported `ScriptError` so the run exits with `EXIT.failure` and prints nothing more.
 *
 * @param report - The report (`runChecks` gives it).
 * @param context - The script's io, style and `--json` mode.
 * @throws A `ScriptError` already reported when a check failed.
 */
export const reportChecks = (
  report: readonly CheckSection[],
  context: { readonly io: ScriptIo; readonly style: OutputStyle; readonly isJson: boolean }
): void => {
  context.io.stdout.write(context.isJson ? formatJson(checksJson(report)) : checks(report, context.style));
  const exitCode = checksExitCode(report);
  if (exitCode !== EXIT.ok)
    throw new ScriptError(`${checkCounts(report).fail} checks failed`, { exitCode, isReported: true });
};
