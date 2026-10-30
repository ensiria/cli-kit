/**
 * Tests for the doctor report: every status, sections, fixes, the summary, JSON, ASCII and no-colour output, and the
 * exit code.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  checkCounts,
  checkProgram,
  checks,
  checksExitCode,
  checksJson,
  reportChecks,
  runChecks
} from "../src/checks.ts";
import type { CheckSection } from "../src/checks.types.ts";
import { EXIT } from "../src/constants.ts";
import { formatJson } from "../src/files.ts";
import { createLogger } from "../src/log.ts";
import { defineScript, ScriptError } from "../src/script.ts";
import { createTestIo, runScript } from "../src/testing.ts";
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

describe("checkProgram", () => {
  /** An io whose programs answer from a table: the program's output, or missing. */
  const ioAnswering = (
    answers: Readonly<Record<string, string | undefined>>
  ): ReturnType<typeof createTestIo>["io"] =>
    createTestIo({
      exec: async (request) => {
        const printed = answers[request.program];
        return printed === undefined
          ? { kind: "missing" }
          : { kind: "ended", stdout: printed, stderr: "", code: 0, signal: null };
      }
    }).io;
  const io = ioAnswering({
    git: "git version 2.39.5 (Apple Git-154)\n",
    old: "old 1.2.0\n",
    odd: "Odd tool\n"
  });

  it("reports the version of an installed program, at or past its minimum", async () => {
    expect(await checkProgram({ program: "git", minimum: "2.39" }, io)).toEqual({
      name: "git",
      status: "ok",
      detail: "2.39.5"
    });
  });

  it("fails a missing or older program, with its fix; warns instead when it is not required", async () => {
    const fix = { command: "brew install tmux" };
    expect(await checkProgram({ program: "tmux", fix }, io)).toEqual({
      name: "tmux",
      status: "fail",
      detail: "not installed, or not on the PATH",
      fix
    });
    expect(
      await checkProgram({ program: "old", name: "Old tool", minimum: "2.0", isRequired: false }, io)
    ).toEqual({
      name: "Old tool",
      status: "warn",
      detail: "1.2.0, needs 2.0 or later"
    });
  });

  it("shows the first line of a program without a version, and fails it when a minimum needs one", async () => {
    expect(await checkProgram({ program: "odd" }, io)).toMatchObject({ status: "ok", detail: "Odd tool" });
    expect(await checkProgram({ program: "odd", minimum: "1.0" }, io)).toMatchObject({
      status: "fail",
      detail: "prints no version to compare with 1.0"
    });
  });
});

describe("runChecks and reportChecks", () => {
  /** A logger-like target for the progress: a pipe, so nothing is drawn. */
  const pipeTarget = (): Parameters<typeof runChecks>[1] => {
    const test = createTestIo();
    return { io: test.io, log: createLogger({ stdout: test.io.stdout, stderr: test.io.stderr }) };
  };

  it("runs every check by section, a check that throws a failed one, silently in a pipe", async () => {
    const target = pipeTarget();
    const report = await runChecks(
      [
        {
          title: "Tools",
          checks: [
            { name: "a", run: () => ({ name: "a", status: "ok", detail: "1.0" }) },
            {
              name: "b",
              run: async (): Promise<never> => {
                throw new Error("boom");
              }
            }
          ]
        }
      ],
      target
    );
    expect(report).toEqual([
      {
        title: "Tools",
        checks: [
          { name: "a", status: "ok", detail: "1.0" },
          { name: "b", status: "fail", detail: "could not be checked: boom" }
        ]
      }
    ]);
  });

  it("prints the report and ends with a failure only when a check failed", async () => {
    const report: readonly CheckSection[] = [
      { title: "T", checks: [{ name: "x", status: "warn", detail: "y" }] }
    ];
    const doctor = defineScript({
      name: "doctor",
      command: "doctor",
      summary: "D.",
      header: false,
      json: true,
      run: ({ io, style, isJson }) => reportChecks(report, { io, style, isJson })
    });
    const warned = await runScript(doctor);
    expect(warned.exitCode).toBe(EXIT.ok);
    expect(warned.stdout).toContain("1 warning");
    const failing = defineScript({
      name: "doctor",
      command: "doctor",
      summary: "D.",
      header: false,
      run: ({ io, style }) => reportChecks(REPORT, { io, style, isJson: false })
    });
    const failed = await runScript(failing);
    expect(failed.exitCode).toBe(EXIT.failure);
    expect(failed.stderr).toBe("");
  });
});
