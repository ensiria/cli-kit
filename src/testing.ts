/**
 * Test helpers: a fake terminal that captures what a script prints, a one-call way to run a script in a test, and a
 * way to run a script file as its own process.
 *
 * @remarks
 * Tests never depend on the real terminal: `createTestIo` sets TTY on or off, the width and the environment, and
 * captures both streams; `runScript` returns the exit code and the output with escape codes stripped;
 * `runScriptProcess` runs an entry file that calls `.run()` when loaded, which a test cannot import.
 *
 * @module
 */
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import type { ExitSignal, InputStream, OutputStream } from "./io.types.ts";
import type { Script } from "./script.types.ts";
import type { ScriptProcessRun, ScriptRun, TestIo, TestIoOptions } from "./testing.types.ts";
import { stripAnsi } from "./text.ts";

/** A captured output stream. */
const captureStream = (
  isTTY: boolean,
  columns: number,
  record: (text: string) => void
): OutputStream & { readonly text: () => string } => {
  let text = "";
  return {
    isTTY,
    columns,
    write: (chunk: string): boolean => {
      text += chunk;
      record(chunk);
      return true;
    },
    text: (): string => text
  };
};

/** A stdin that holds the given text and stays open until `end` is called. */
const inputStream = (isTTY: boolean, input: string | undefined): PassThrough & InputStream => {
  const stream: PassThrough & InputStream = Object.assign(new PassThrough(), {
    isTTY,
    setRawMode: isTTY ? (): undefined => undefined : undefined
  });
  stream.setEncoding("utf8");
  if (input !== undefined) stream.write(input);
  return stream;
};

/**
 * A fake terminal for tests.
 *
 * @param options - TTY, width, environment, stdin text and arguments.
 * @returns The io and accessors for what was written.
 * @example
 * ```ts
 * const test = createTestIo({ tty: true, env: { FORCE_COLOR: "1" } });
 * await script.run(["--check"], { io: test.io });
 * expect(stripAnsi(test.stdout())).toContain("valid");
 * ```
 */
export const createTestIo = (options: TestIoOptions = {}): TestIo => {
  const isTTY = options.tty ?? false;
  const columns = options.columns ?? 80;
  let output = "";
  const record = (chunk: string): void => {
    output += chunk;
  };
  const stdout = captureStream(isTTY, columns, record);
  const stderr = captureStream(isTTY, columns, record);
  const stdin = inputStream(isTTY, options.input);
  const signals = new EventEmitter();
  let exitedWith: number | undefined;
  let exitCode: number | undefined;
  return {
    io: {
      cwd: options.cwd ?? "/",
      argv: options.argv ?? [],
      stdout,
      stderr,
      stdin,
      env: options.env ?? {},
      signals: {
        on: (signal: ExitSignal, listener: () => void): unknown => signals.on(signal, listener),
        off: (signal: ExitSignal, listener: () => void): unknown => signals.off(signal, listener)
      },
      setExitCode: (code: number): void => {
        exitCode = code;
      },
      exit: (code: number): void => {
        exitedWith = code;
      },
      ...(options.exec === undefined ? {} : { runProgram: options.exec })
    },
    stdout: stdout.text,
    stderr: stderr.text,
    output: (): string => output,
    type: (text: string): void => {
      stdin.write(text);
    },
    endInput: (): void => {
      stdin.end();
    },
    signal: (signal: ExitSignal): void => {
      signals.emit(signal);
    },
    exitedWith: (): number | undefined => exitedWith,
    exitCode: (): number | undefined => exitCode
  };
};

/**
 * Runs a script in a test and returns its exit code and output.
 *
 * @param script - What `defineScript` returned.
 * @param argv - The command-line arguments.
 * @param options - The fake terminal (see {@link createTestIo}).
 * @returns The exit code, and stdout / stderr with and without escape codes.
 * @example
 * ```ts
 * const { exitCode, stdout } = await runScript(script, ["--json"]);
 * expect(exitCode).toBe(EXIT.ok);
 * ```
 */
export const runScript = async (
  script: Script,
  argv: readonly string[] = [],
  options: TestIoOptions = {}
): Promise<ScriptRun> => {
  const test = createTestIo(options);
  const exitCode = await script.run(argv, { io: test.io });
  return {
    exitCode,
    stdout: stripAnsi(test.stdout()),
    stderr: stripAnsi(test.stderr()),
    rawStdout: test.stdout(),
    rawStderr: test.stderr()
  };
};

/**
 * Runs a script file as its own Node process in a test, with colour off, and returns its exit code and output.
 *
 * @remarks
 * For a script's entry (`<command>.mts`), which calls `.run()` as soon as it is loaded and so cannot be imported by a
 * test the way {@link runScript} needs. The child gets only `NO_COLOR=1` and the given variables as its environment,
 * so the caller's terminal settings (`FORCE_COLOR`, `CI`) never change its output.
 *
 * @param path - The script file.
 * @param argv - The command-line arguments.
 * @param env - Extra environment variables for the child.
 * @returns The exit code (`null` when killed by a signal), stdout and stderr.
 * @example
 * ```ts
 * const { exitCode, stdout } = runScriptProcess(join(import.meta.dirname, "build-order.mts"), ["--check"]);
 * expect(exitCode).toBe(EXIT.ok);
 * ```
 */
export const runScriptProcess = (
  path: string,
  argv: readonly string[] = [],
  env: Readonly<Record<string, string>> = {}
): ScriptProcessRun => {
  const result = spawnSync(process.execPath, [path, ...argv], {
    encoding: "utf8",
    env: { NO_COLOR: "1", ...env }
  });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};
