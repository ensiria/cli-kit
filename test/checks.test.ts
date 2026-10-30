/**
 * Tests for the doctor report: every status, sections, fixes, the summary, JSON, ASCII and no-colour output, and the
 * exit code.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { checkCounts, checks, checksExitCode, checksJson } from "../src/checks.ts";
import type { CheckSection } from "../src/checks.types.ts";
import { EXIT } from "../src/constants.ts";
import { formatJson } from "../src/files.ts";
import { defineScript, ScriptError } from "../src/script.ts";
import { runScript } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

/** A report with every status and both kinds of fix. */
const REPORT: readonly CheckSection[] = [
  {
    title: "Tools",
    checks: [
      { name: "node", status: "ok", detail: "24.14.0" },
      { name: "tmux", status: "fail", detail: "not on the PATH", fix: { command: "brew install tmux" } }
    ]
  },
  {
    title: "Settings",
    checks: [
      {
        name: "theme",
        status: "warn",
        detail: "unknown value, the default is used",
        fix: { hint: "Pick one in Settings" }
      },
      { name: "keychain", status: "skip", detail: "not on macOS" }
    ]
  }
];

describe("checks", () => {
  it("writes each section and check, the fixes under them, and the summary, plain without colour", () => {
    expect(checks(REPORT, { color: false, unicode: true, width: 80 })).toBe(
      [
        "Tools",
        "  ✓ node — 24.14.0",
        "  ✗ tmux — not on the PATH",
        "    → run: brew install tmux",
        "",
        "Settings",
        "  ! theme — unknown value, the default is used",
        "    → Pick one in Settings",
        "  – keychain — not on macOS",
        "",
        "1 ok, 1 warning, 1 problem, 1 skipped",
        ""
      ].join("\n")
    );
  });

  it("uses ASCII glyphs without Unicode, and colours each status's tone", () => {
    const ascii = checks(REPORT, { color: false, unicode: false, width: 80 });
    expect(ascii).toContain("  + node - 24.14.0");
    expect(ascii).toContain("    -> run: brew install tmux");
    const coloured = checks(REPORT, { color: true, unicode: true, width: 80 });
    expect(coloured).not.toBe(stripAnsi(coloured));
    expect(stripAnsi(coloured)).toBe(checks(REPORT, { color: false, unicode: true, width: 80 }));
  });

  it("counts plurals in the summary, and says when nothing was checked", () => {
    const many: readonly CheckSection[] = [
      {
        title: "A",
        checks: [1, 2, 3].map((index) => ({ name: `w${index}`, status: "warn" as const, detail: "x" }))
      }
    ];
    expect(checks(many, { color: false, unicode: true, width: 80 })).toContain("3 warnings");
    expect(checks([], { color: false, unicode: true, width: 80 })).toBe("nothing checked\n");
  });

  it("lists every check with its section for --json", () => {
    expect(checksJson(REPORT)).toEqual([
      { section: "Tools", name: "node", status: "ok", detail: "24.14.0", fix: null },
      {
        section: "Tools",
        name: "tmux",
        status: "fail",
        detail: "not on the PATH",
        fix: { command: "brew install tmux" }
      },
      {
        section: "Settings",
        name: "theme",
        status: "warn",
        detail: "unknown value, the default is used",
        fix: { hint: "Pick one in Settings" }
      },
      { section: "Settings", name: "keychain", status: "skip", detail: "not on macOS", fix: null }
    ]);
  });

  it("fails only when a check failed: warnings and skips never do", () => {
    expect(checkCounts(REPORT)).toEqual({ ok: 1, warn: 1, fail: 1, skip: 1 });
    expect(checksExitCode(REPORT)).toBe(EXIT.failure);
    const settings = REPORT[1];
    expect(checksExitCode(settings ? [settings] : [])).toBe(EXIT.ok);
  });

  it("ends a doctor script with the report on stdout and its code, no other message, as the module's example does", async () => {
    const doctor = defineScript({
      name: "doctor",
      command: "doctor",
      summary: "Check the setup.",
      header: false,
      json: true,
      run: ({ io, style, isJson }) => {
        io.stdout.write(isJson ? formatJson(checksJson(REPORT)) : checks(REPORT, style));
        const exitCode = checksExitCode(REPORT);
        if (exitCode !== EXIT.ok) throw new ScriptError("some checks failed", { exitCode, isReported: true });
      }
    });
    const run = await runScript(doctor);
    expect(run.exitCode).toBe(EXIT.failure);
    expect(run.stdout).toContain("1 ok, 1 warning, 1 problem, 1 skipped");
    expect(run.stderr).toBe("");
    const json = await runScript(doctor, ["--json"]);
    expect(JSON.parse(json.stdout)).toHaveLength(4);
  });
});
