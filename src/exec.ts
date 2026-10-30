/**
 * `exec()`: runs a program and gets its result, with the kit's error handling, so a failing tool reads the same in
 * every script.
 *
 * @remarks
 * Arguments are an array, never a shell string; the program is looked for on the environment's `PATH`. A non-zero
 * exit, a missing program and a timeout become `ScriptError`s naming the program; `check: false` hands back a non-zero
 * exit instead. Output is kept (`capture`), printed as the program writes it (`inherit`), or printed line by line after
 * a label and kept (`prefix`, for long builds). Programs still running when the script ends, fails or is stopped with
 * Ctrl+C are stopped by the script's run. The io decides how programs start: the process's spawns them, a test's
 * (`createTestIo({ exec })`) answers without starting anything. It takes `ScriptError` from `script.ts`, which takes
 * the run from `runner.ts`, which stops the running programs through this module: each uses the others' exports only
 * inside functions, so the cycle is safe.
 *
 * @module
 */
import { type ChildProcess, spawn } from "node:child_process";

import { SYMBOLS } from "./constants.ts";
import type { ExecOptions, ExecResult, ProgramOutcome, ProgramRequest, ProgramRunner } from "./exec.types.ts";
import { supportsUnicode } from "./glyphs.ts";
import { processIo } from "./io.ts";
import type { OutputStream, ScriptIo } from "./io.types.ts";
import { ScriptError } from "./script.ts";
import { paint, supportsColor } from "./style.ts";

/** How long a program stopped with SIGTERM has before SIGKILL, in ms. */
const KILL_GRACE_MS = 2000;

/** How many of the last lines of stderr a failure's hint shows. */
const HINT_LINES = 5;

/** The programs started by `exec` and still running, stopped when the script's run ends. */
const running = new Set<ChildProcess>();

/**
 * Stops every program `exec` started that is still running: called by the script's run when it ends, fails or is
 * stopped, so no child outlives the script.
 */
export const stopPrograms = (): void => {
  for (const child of running) child.kill("SIGTERM");
  running.clear();
};

/** A command line as a failure names it: the program and its arguments. */
const commandText = (program: string, args: readonly string[]): string => [program, ...args].join(" ");

/**
 * Writes text line by line after a label, holding a line until it ends.
 *
 * @param stream - Where the lines go.
 * @param label - The label, already painted.
 * @returns The writer, and a flush for the last line without a newline.
 */
const prefixedLines = (
  stream: OutputStream,
  label: string
): { readonly write: (chunk: string) => void; readonly flush: () => void } => {
  let pending = "";
  return {
    write: (chunk: string): void => {
      const lines = `${pending}${chunk}`.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) stream.write(`${label}${line}\n`);
    },
    flush: (): void => {
      if (pending !== "") stream.write(`${label}${pending}\n`);
      pending = "";
    }
  };
};

/**
 * Where a program's stdout and stderr chunks go, besides being kept: the io's streams with `inherit` when the script
 * has no terminal of its own to hand the program, the prefixed lines with `prefix`, nowhere with `capture`.
 */
const forwarders = (
  request: ProgramRequest,
  io: ScriptIo
): {
  readonly stdout: (chunk: string) => void;
  readonly stderr: (chunk: string) => void;
  readonly flush: () => void;
} => {
  if (request.output === "inherit") {
    return {
      stdout: (chunk: string): void => void io.stdout.write(chunk),
      stderr: (chunk: string): void => void io.stderr.write(chunk),
      flush: (): void => undefined
    };
  }
  if (request.output === "prefix") {
    const separator = SYMBOLS.box[supportsUnicode(io.env) ? "unicode" : "ascii"].vertical;
    const label = `${paint("muted", `${request.prefix} ${separator} `, supportsColor(io.stderr, io.env))}`;
    const out = prefixedLines(io.stderr, label);
    const err = prefixedLines(io.stderr, label);
    return {
      stdout: out.write,
      stderr: err.write,
      flush: (): void => {
        out.flush();
        err.flush();
      }
    };
  }
  return { stdout: (): void => undefined, stderr: (): void => undefined, flush: (): void => undefined };
};

/**
 * The runner of the process: spawns the program (no shell) and reports how it ended. With `inherit` and the process's
 * own streams, the program gets the terminal itself, colours and prompts included.
 *
 * @param request - The program and how to run it.
 * @param io - The io it prints through.
 */
export const spawnProgram: ProgramRunner = (request: ProgramRequest, io: ScriptIo): Promise<ProgramOutcome> =>
  new Promise<ProgramOutcome>((resolve) => {
    const isOwnTerminal =
      request.output === "inherit" && io.stdout === process.stdout && io.stderr === process.stderr;
    const output = isOwnTerminal ? "inherit" : "pipe";
    const child = spawn(request.program, [...request.args], {
      cwd: request.cwd,
      env: request.env,
      stdio: [request.input === undefined ? "ignore" : "pipe", output, output]
    });
    running.add(child);
    const forward = forwarders(request, io);
    let stdout = "";
    let stderr = "";
    let isTimedOut = false;
    child.stdout?.setEncoding("utf8").on("data", (chunk: string): void => {
      stdout += chunk;
      forward.stdout(chunk);
    });
    child.stderr?.setEncoding("utf8").on("data", (chunk: string): void => {
      stderr += chunk;
      forward.stderr(chunk);
    });
    const timer =
      request.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            isTimedOut = true;
            child.kill("SIGTERM");
            setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS).unref();
          }, request.timeoutMs);
    child.on("error", (error: NodeJS.ErrnoException): void => {
      clearTimeout(timer);
      running.delete(child);
      resolve(error.code === "ENOENT" ? { kind: "missing" } : { kind: "failed", message: error.message });
    });
    child.on("close", (code: number | null, signal: NodeJS.Signals | null): void => {
      clearTimeout(timer);
      running.delete(child);
      forward.flush();
      const kept = request.output === "inherit" ? { stdout: "", stderr: "" } : { stdout, stderr };
      resolve(isTimedOut ? { kind: "timeout", ...kept } : { kind: "ended", ...kept, code, signal });
    });
    child.stdin?.end(request.input);
  });

/** The last lines of a program's stderr, for a failure's hint. */
const lastLines = (text: string): string | undefined => {
  const lines = text.trimEnd().split("\n").slice(-HINT_LINES);
  return lines.join("\n") === "" ? undefined : lines.join("\n");
};

/**
 * Runs a program and returns what it left.
 *
 * @param program - The program, looked for on `env.PATH`.
 * @param args - Its arguments, as an array (never a shell string).
 * @param options - Where it runs, its environment and stdin, its time limit, where its output goes, whether a non-zero
 * exit fails, and the io (the script's `context.io`, so its tests' runner answers instead of real programs).
 * @returns Its stdout, stderr, exit code and signal.
 * @throws A `ScriptError` when the program is missing, runs past its time, cannot start, or (with `check`, the
 * default) exits with a non-zero code: the message names the command, the hint shows the end of its stderr.
 * @example
 * ```ts
 * const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"], { io: context.io });
 * await exec("pnpm", ["build"], { output: "prefix", prefix: "build", timeoutMs: 120_000, io: context.io });
 * ```
 */
export const exec = async (
  program: string,
  args: readonly string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> => {
  const io = options.io ?? processIo();
  const request: ProgramRequest = {
    program,
    args,
    cwd: options.cwd ?? io.cwd,
    env: options.env ?? io.env,
    input: options.input,
    timeoutMs: options.timeoutMs,
    output: options.output ?? "capture",
    prefix: options.prefix ?? program
  };
  const outcome = await (io.runProgram ?? spawnProgram)(request, io);
  const command = commandText(program, args);
  if (outcome.kind === "missing") {
    throw new ScriptError(`${program} is not installed or not on the PATH`, {
      hint: `Install ${program}, or check the PATH ${command} ran with`
    });
  }
  if (outcome.kind === "failed") throw new ScriptError(`${command} could not start: ${outcome.message}`);
  if (outcome.kind === "timeout") {
    throw new ScriptError(`${command} ran past ${String(options.timeoutMs)} ms and was stopped`, {
      hint: lastLines(outcome.stderr)
    });
  }
  const { stdout, stderr, code, signal } = outcome;
  if ((options.check ?? true) && code !== 0) {
    const how = code === null ? `was stopped by ${String(signal)}` : `exited with code ${code}`;
    throw new ScriptError(`${command} ${how}`, { hint: lastLines(stderr) });
  }
  return { stdout, stderr, code, signal };
};
