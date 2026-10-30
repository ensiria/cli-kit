/**
 * The types of the header line.
 *
 * @module
 */
import type { GlyphName } from "./glyphs.types.ts";
import type { Tone } from "./style.types.ts";

/** What the header shows. */
export interface HeaderOptions {
  /** The script's name. */
  readonly name: string;
  /** One line: what it does. */
  readonly summary: string;
  /** The script's glyph, so it is recognisable at a glance. @defaultValue "arrow" */
  readonly icon?: GlyphName | undefined;
  /** The icon's tone. @defaultValue "accent" */
  readonly tone?: Tone | undefined;
  /** Shown muted after the name. */
  readonly version?: string | undefined;
}
