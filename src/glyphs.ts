/**
 * The glyphs every script prints, so a success, a warning or a step looks the same in every tool.
 *
 * @remarks
 * They mirror the Kaji UI step glyphs and tones (`GLYPHS` in `constants.ts`); each has an ASCII fallback for
 * terminals that cannot show them (`TERM=dumb`, or `CLI_KIT_ASCII=1`).
 *
 * @module
 */
import { ENV, GLYPHS } from "./constants.ts";
import type { GlyphName } from "./glyphs.types.ts";
import type { ScriptIo } from "./io.types.ts";

/**
 * Whether the terminal should get Unicode glyphs (off for `TERM=dumb` or when `CLI_KIT_ASCII=1`).
 *
 * @param env - The environment.
 * @returns True for Unicode, false for the ASCII forms.
 */
export const supportsUnicode = (env: ScriptIo["env"]): boolean =>
  env[ENV.ascii] !== "1" && env[ENV.term] !== "dumb";

/**
 * Picks the Unicode or the ASCII form of anything drawn in both (glyphs, symbols, spinner frames).
 *
 * @param pair - The two forms.
 * @param unicode - Whether Unicode is available.
 * @returns The form to print.
 */
export const pick = <TUnicode, TAscii>(
  pair: { readonly unicode: TUnicode; readonly ascii: TAscii },
  unicode: boolean
): TUnicode | TAscii => (unicode ? pair.unicode : pair.ascii);

/**
 * The character to print for a glyph.
 *
 * @param name - Which glyph.
 * @param unicode - Whether Unicode is available (see {@link supportsUnicode}).
 * @returns The Unicode or the ASCII form.
 */
export const glyph = (name: GlyphName, unicode: boolean): string => pick(GLYPHS[name], unicode);
