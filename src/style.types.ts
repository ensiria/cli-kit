/**
 * The type of a tone, the meaning a piece of text carries.
 *
 * @module
 */
import type { TONES } from "./constants.ts";

/** A tone: what the text means. The same names as the Kaji UI tones. */
export type Tone = keyof typeof TONES;
