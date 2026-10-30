/**
 * The line every script opens with: its icon, name, version and summary, one look for every tool.
 *
 * @remarks
 * Each script picks its own icon glyph and tone so it is recognisable at a glance in a long log. `defineScript`
 * prints it on stderr (it is not a result: piping stdout never captures it) unless `--quiet` or `--json`.
 *
 * @module
 */
import { glyph } from "./glyphs.ts";
import type { HeaderOptions } from "./header.types.ts";
import type { OutputStyle } from "./log.types.ts";
import { paint } from "./style.ts";
import { truncate } from "./text.ts";

/**
 * The header line.
 *
 * @param options - Name, summary, icon, tone and version.
 * @param style - Colour, Unicode and width; the summary is cut to fit the width.
 * @returns One line, without a newline.
 * @example
 * ```ts
 * header({ name: "build-order", summary: "Recompute the build order", icon: "build" }, log.style);
 * // ✦ build-order Recompute the build order
 * ```
 */
export const header = (options: HeaderOptions, style: OutputStyle): string => {
  const icon = paint(options.tone ?? "accent", glyph(options.icon ?? "arrow", style.unicode), style.color);
  const name = paint("strong", options.name, style.color);
  const version = options.version ? ` ${paint("muted", options.version, style.color)}` : "";
  const used = 2 + options.name.length + (options.version ? options.version.length + 1 : 0) + 1;
  const summary = paint(
    "muted",
    truncate(options.summary, Math.max(10, style.width - used), style),
    style.color
  );
  return `${icon} ${name}${version} ${summary}`;
};
