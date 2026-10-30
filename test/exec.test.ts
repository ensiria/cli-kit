/**
 * Tests for `exec()`: capture, inherit and prefix output, a non-zero exit with and without `check`, a missing program,
 * a timeout, programs stopped when the script ends or is stopped, and a test's runner.
 *
 * @module
 */
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EXIT } from "../src/constants.ts";
import { exec } from "../src/exec.ts";
import type { ProgramRequest } from "../src/exec.types.ts";
import { processIo } from "../src/io.ts";
import { defineScript, ScriptError } from "../src/script.ts";
import { createTestIo } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

/** Node itself: a program every machine running the tests has. */
const NODE = process.execPath;

/** A test io with the process's environment, so the real runner finds programs on its `PATH`. */
const processLikeIo = (): ReturnType<typeof createTestIo> =>
  createTestIo({ env: { ...processIo().env, NO_COLOR: "1" }, cwd: process.cwd() });

describe("exec with a real program", () => {
  it("captures stdout and stderr, and writes the input to stdin", async () => {
    const test = processLikeIo();
    const result = await exec(
      NODE,
      [
        "-e",
        "process.stdin.on('data', (d) => process.stdout.write(String(d).toUpperCase())); console.error('note')"
      ],
      { input: "hello", io: test.io }
    );
    expect(result).toEqual({ stdout: "HELLO", stderr: "note\n", code: 0, signal: null });
    expect(test.output()).toBe("");
  });

  it("prints the output as it comes with inherit, on the io's streams when they are not the terminal", async () => {
    const test = processLikeIo();
    const result = await exec(NODE, ["-e", "console.log('out'); console.error('err')"], {
      output: "inherit",
      io: test.io
    });
    expect(test.stdout()).toBe("out\n");
    expect(test.stderr()).toBe("err\n");
    expect(result.stdout).toBe("");
  });

  it("prints each line after a label with prefix, the last one even without a newline, and keeps them", async () => {
    const test = processLikeIo();
    const result = await exec(NODE, ["-e", "process.stdout.write('one\\ntwo')"], {
      output: "prefix",
      prefix: "build",
      io: test.io
    });
    expect(test.stderr()).toBe("build │ one\nbuild │ two\n");
    expect(result.stdout).toBe("one\ntwo");
  });

  it("paints the label on a terminal, and leaves it plain in a pipe", async () => {
    const { NO_COLOR: _noColor, FORCE_COLOR: _forceColor, ...env } = processIo().env;
    const terminal = createTestIo({ tty: true, env, cwd: process.cwd() });
    await exec(NODE, ["-e", "console.log('x')"], { output: "prefix", prefix: "tsc", io: terminal.io });
    expect(terminal.stderr()).not.toBe(stripAnsi(terminal.stderr()));
    expect(stripAnsi(terminal.stderr())).toBe("tsc │ x\n");
    const pipe = processLikeIo();
    await exec(NODE, ["-e", "console.log('x')"], { output: "prefix", prefix: "tsc", io: pipe.io });
    expect(pipe.stderr()).toBe("tsc │ x\n");
  });

  it("fails on a non-zero exit with the command, its code and the end of its stderr; or returns it without check", async () => {
    const test = processLikeIo();
    const failing = ["-e", "console.error('line 1\\nline 2'); process.exit(3)"];
    const error = await exec(NODE, failing, { io: test.io }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ScriptError);
    expect(error).toMatchObject({
      message: `${NODE} ${failing.join(" ")} exited with code 3`,
      hint: "line 1\nline 2"
    });
    const result = await exec(NODE, failing, { check: false, io: test.io });
    expect(result.code).toBe(3);
  });

  it("names a missing program", async () => {
    const error = await exec("cli-kit-no-such-program", [], { io: processLikeIo().io }).catch(
      (caught: unknown) => caught
    );
    expect(error).toMatchObject({ message: "cli-kit-no-such-program is not installed or not on the PATH" });
  });

  it("stops a program that runs past its time, and says so", async () => {
    const error = await exec(NODE, ["-e", "setInterval(() => {}, 1000)"], {
      timeoutMs: 100,
      io: processLikeIo().io
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ScriptError);
    expect(error).toMatchObject({ message: expect.stringContaining("ran past 100 ms and was stopped") });
  });

  it("stops a program still running when the script is stopped with Ctrl+C", async () => {
    const folder = mkdtempSync(join(tmpdir(), "cli-kit-exec-"));
    const started = join(folder, "started");
    const test = createTestIo({ env: { ...processIo().env, NO_COLOR: "1" }, cwd: folder });
    const script = defineScript({
      name: "waits",
      command: "waits",
      summary: "Runs a program that never ends.",
      header: false,
      run: async ({ io }) => {
        await exec(
          NODE,
          [
            "-e",
            `require("node:fs").writeFileSync(${JSON.stringify(started)}, String(process.pid)); setInterval(() => {}, 1000)`
          ],
          { io }
        );
      }
    });
    const running = script.run([], { io: test.io });
    while (!existsSync(started)) await new Promise((resolve) => setTimeout(resolve, 20));
    const pid = Number(readFileSync(started, "utf8"));
    test.signal("SIGINT");
    expect(await running).toBe(130);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(() => process.kill(pid, 0)).toThrow();
  });
});

describe("exec with a test's runner", () => {
  it("asks the io's runner instead of starting a program, with the options resolved", async () => {
    const requests: ProgramRequest[] = [];
    const test = createTestIo({
      cwd: "/repo",
      exec: async (request) => {
        requests.push(request);
        return { kind: "ended", stdout: "/repo\n", stderr: "", code: 0, signal: null };
      }
    });
    const script = defineScript({
      name: "root",
      command: "root",
      summary: "Prints the repo's root.",
      header: false,
      run: async ({ io, log }) => {
        const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"], { io });
        log.plain(stdout.trim());
      }
    });
    expect(await script.run([], { io: test.io })).toBe(EXIT.ok);
    expect(test.stdout()).toBe("/repo\n");
    expect(requests).toEqual([
      {
        program: "git",
        args: ["rev-parse", "--show-toplevel"],
        cwd: "/repo",
        env: {},
        input: undefined,
        timeoutMs: undefined,
        output: "capture",
        prefix: "git"
      }
    ]);
  });

  it("reports a missing program from the runner as the real one would", async () => {
    const test = createTestIo({ exec: async () => ({ kind: "missing" }) });
    await expect(exec("tmux", ["ls"], { io: test.io })).rejects.toThrow(
      "tmux is not installed or not on the PATH"
    );
  });
});
