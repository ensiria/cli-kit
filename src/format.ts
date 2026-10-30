/**
 * Numbers, sizes, durations and dates as people read them, on `Intl`.
 *
 * @remarks
 * The kit owns this copy until Kaji UI's format and `dates` helpers land; then one implementation is shared, or a test
 * keeps the two equal (open question 3 of docs/plans/cli-kit-plan.md). Every helper takes an optional locale, English
 * by default.
 *
 * @module
 */

/** The locale used when none is given. */
const DEFAULT_LOCALE = "en";

/** Byte units, decimal (1 kB = 1000 B) like macOS and most file managers. */
const BYTE_UNITS: readonly string[] = ["B", "kB", "MB", "GB", "TB", "PB"];

/** Milliseconds in each unit a duration is split into, largest first. */
const DURATION_UNITS: readonly (readonly [string, number])[] = [
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["min", 60_000],
  ["s", 1000]
];

/** Seconds in each unit relative times are expressed in, largest first. */
const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1]
];

/**
 * A duration in the largest units that matter: `850 ms`, `1.2 s`, `3 min 4 s`, `2 h 5 min`, `1 d 3 h`.
 *
 * @param milliseconds - The duration; negative values are shown as positive.
 * @param locale - For the decimal separator. @defaultValue "en"
 * @returns The text, at most two units.
 */
export const formatDuration = (milliseconds: number, locale: string = DEFAULT_LOCALE): string => {
  const total = Math.abs(milliseconds);
  if (total < 1000) return `${Math.round(total)} ms`;
  if (total < 10_000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(total / 1000)} s`;
  }
  const parts: string[] = [];
  let rest = Math.round(total / 1000) * 1000;
  for (const [unit, size] of DURATION_UNITS) {
    const count = Math.floor(rest / size);
    if (count > 0 || parts.length > 0) parts.push(`${count} ${unit}`);
    rest -= count * size;
    if (parts.length === 2) break;
  }
  return parts.filter((part) => !part.startsWith("0 ")).join(" ");
};

/**
 * A size in bytes with a decimal unit: `512 B`, `1.2 kB`, `34 MB`.
 *
 * @param bytes - The size.
 * @param locale - For the decimal separator. @defaultValue "en"
 * @returns The text, with one decimal below 10 of a unit.
 */
export const formatBytes = (bytes: number, locale: string = DEFAULT_LOCALE): string => {
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = unit > 0 && value < 10 ? 1 : 0;
  const sign = bytes < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${BYTE_UNITS[unit]}`;
};

/**
 * A count with the locale's grouping, or compact (`1.2K`) when asked.
 *
 * @param count - The number.
 * @param options - `compact` for short forms. @defaultValue \{ compact: false \}
 * @param locale - The locale. @defaultValue "en"
 * @returns The text.
 */
export const formatCount = (
  count: number,
  options: { compact?: boolean | undefined } = {},
  locale: string = DEFAULT_LOCALE
): string =>
  new Intl.NumberFormat(
    locale,
    options.compact ? { notation: "compact", maximumFractionDigits: 1 } : {}
  ).format(count);

/**
 * How long ago or how far ahead a moment is: `5 minutes ago`, `in 2 days`, `now`.
 *
 * @param moment - The moment (a date or epoch milliseconds).
 * @param now - The reference moment, passed in so callers and tests control the clock.
 * @param locale - The locale. @defaultValue "en"
 * @returns The text.
 */
export const formatRelativeTime = (
  moment: Date | number,
  now: Date | number,
  locale: string = DEFAULT_LOCALE
): string => {
  const seconds = Math.round((Number(moment) - Number(now)) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return formatter.format(Math.trunc(seconds / size), unit);
    }
  }
  return formatter.format(0, "second");
};

/**
 * A count with its noun in the right form: `1 file`, `3 files`, `0 files`.
 *
 * @param count - How many.
 * @param singular - The noun for one.
 * @param pluralForm - The noun for any other count. @defaultValue singular + "s"
 * @param locale - Plural rules and grouping. @defaultValue "en"
 * @returns The count and the noun.
 */
export const plural = (
  count: number,
  singular: string,
  pluralForm: string = `${singular}s`,
  locale: string = DEFAULT_LOCALE
): string => {
  const noun = new Intl.PluralRules(locale).select(count) === "one" ? singular : pluralForm;
  return `${formatCount(count, {}, locale)} ${noun}`;
};
