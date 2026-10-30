/**
 * The real process as a {@link ScriptIo}, plus the questions every helper asks about it: is this a terminal, how wide
 * is it, should live output animate.
 *
 * @remarks
 * The only module of the kit that touches `process`; everything else receives a `ScriptIo`.
 *
 * @module
 */
import { ENV } from "./constants.ts";
import type { OutputStream, ScriptIo } from "./io.types.ts";

/** Width used when the stream does not say (a pipe, a CI log). */
const FALLBACK_COLUMNS = 80;

/**
 * The real process: its streams, environment, signals and exit.
 *
 * @returns A `ScriptIo` bound to `process`.
 */
export const processIo = (): ScriptIo => ({
  cwd: process.cwd(),
  argv: process.argv.slice(2),
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  env: process.env,
  signals: process,
  setExitCode: (code: number): void => {
    process.exitCode = code;
  },
  exit: (code: number): void => process.exit(code)
});

/**
 * The width to lay text out in.
 *
 * @param stream - Where the text goes.
 * @param fallback - Used when the stream is not a terminal or does not know its width.
 * @returns Columns, at least 20.
 * @defaultValue fallback 80
 */
export const terminalWidth = (stream: OutputStream, fallback: number = FALLBACK_COLUMNS): number =>
  Math.max(20, stream.isTTY === true && stream.columns ? stream.columns : fallback);

/** Whether the environment says we run in CI (any non-empty `CI` other than `false` / `0`). */
export const isCi = (env: ScriptIo["env"]): boolean => {
  const value = env[ENV.ci];
  return value !== undefined && value !== "" && value !== "false" && value !== "0";
};

/**
 * Whether live output (spinners, redrawn bars, interactive prompts) can be used on a stream: a terminal, not
 * `TERM=dumb`, not CI. Otherwise the helpers print plain lines.
 *
 * @param stream - Where the live output would go.
 * @param env - The environment.
 * @returns True when the stream can be redrawn in place.
 */
export const isInteractive = (stream: OutputStream, env: ScriptIo["env"]): boolean =>
  stream.isTTY === true && env[ENV.term] !== "dumb" && !isCi(env);
