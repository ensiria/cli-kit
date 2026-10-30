/**
 * Tests for the `doctor` example's checks, on a folder of its own, with the programs answered by a test's runner.
 *
 * @module
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runChecks } from "../../src/checks.ts";
import type { ProgramRequest } from "../../src/exec.types.ts";
import { createLogger } from "../../src/log.ts";
import { createTestIo } from "../../src/testing.ts";
import { doctorChecks } from "./doctor.ts";

/** What each program prints, as the test's runner answers it; a program not listed is missing. */
const PROGRAMS: Readonly<Record<string, string>> = {
  "node --version": "v22.17.0\n",
  "git --version": "git version 2.45.0\n",
  "git rev-parse --is-inside-work-tree": "true\n",
  "git status --porcelain": " M README.md\n"
};

describe("doctor", () => {
  it("reports an old Node, a missing pnpm, the project and a changed working tree", async () => {
    const folder = mkdtempSync(join(tmpdir(), "doctor-"));
    writeFileSync(join(folder, "package.json"), "{}");
    writeFileSync(join(folder, "pnpm-lock.yaml"), "");
    const test = createTestIo({
      cwd: folder,
      exec: async (request: ProgramRequest) => {
        const printed = PROGRAMS[[request.program, ...request.args].join(" ")];
        return printed === undefined
          ? { kind: "missing" }
          : { kind: "ended", stdout: printed, stderr: "", code: 0, signal: null };
      }
    });
    const report = await runChecks(doctorChecks(test.io), {
      io: test.io,
      log: createLogger({ stdout: test.io.stdout, stderr: test.io.stderr })
    });
    const byName = Object.fromEntries(
      report.flatMap((section) => section.checks).map((check) => [check.name, check])
    );
    expect(byName["node"]).toMatchObject({ status: "fail", detail: "22.17.0, needs 22.18 or later" });
    expect(byName["git"]).toMatchObject({ status: "ok", detail: "2.45.0" });
    expect(byName["pnpm"]).toMatchObject({ status: "warn", detail: "not installed, or not on the PATH" });
    expect(byName["lockfile"]).toMatchObject({ status: "ok", detail: "pnpm-lock.yaml" });
    expect(byName["git repository"]).toMatchObject({ status: "warn", detail: "1 file changed or new" });
    expect(byName["EDITOR"]).toMatchObject({ status: "skip" });
  });
});
