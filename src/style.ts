/**
 * Colours by meaning, not by name: a script asks for `success` or `muted`, never for "green".
 *
 * @remarks
 * Built on Node's `util.styleText`. Colour is off when `NO_COLOR` is set, when `FORCE_COLOR=0`, when the stream is
 * not a terminal (pipes, CI logs) or when the script got `--no-color`; `FORCE_COLOR=1` turns it on.
 *
 * @module
 */
import { styleText } from "node:util";

import { ENV, TONES } from "./constants.ts";
import type { OutputStream, ScriptIo } from "./io.types.ts";
import type { Tone } from "./style.types.ts";

/**
 * Whether output to a stream should be coloured.
 *
 * @param stream - Where the text goes.
 * @param env - The environment, for `NO_COLOR` / `FORCE_COLOR`.
 * @returns True when colours should be printed.
 */
export const supportsColor = (stream: OutputStream, env: ScriptIo["env"]): boolean => {
  const noColor = env[ENV.noColor];
  if (noColor !== undefined && noColor !== "") return false;
  const forceColor = env[ENV.forceColor];
  if (forceColor === "0") return false;
  if (forceColor !== undefined && forceColor !== "") return true;
  return stream.isTTY === true;
};

/**
 * Paints text with a tone.
 *
 * @param tone - What the text means.
 * @param text - The text.
 * @param color - Whether colour is on; when false the text comes back unchanged.
 * @returns The styled text.
 */
export const paint = (tone: Tone, text: string, color: boolean): string =>
  color && tone !== "neutral" ? styleText(TONES[tone], text, { validateStream: false }) : text;
