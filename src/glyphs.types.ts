/**
 * The type of a glyph name.
 *
 * @module
 */
import type { GLYPHS } from "./constants.ts";

/** Name of a glyph, one per kind of line or state. */
export type GlyphName = keyof typeof GLYPHS;
