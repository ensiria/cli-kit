/**
 * "Did you mean": the known words close to one the user typed, for the usage error of an unknown option or command.
 *
 * @remarks
 * A word is close when it is at most two edits away (Levenshtein distance: an insertion, a deletion or a substitution
 * each count one), the closest ones only; when none is, a word the typed one starts exactly one known word. Nothing
 * runs on a guess: the suggestion is only part of the message.
 *
 * @module
 */

/** The most edits a suggestion may be away from the word typed. */
const MAX_DISTANCE = 2;

/**
 * The number of single-character edits between two words.
 *
 * @param from - One word.
 * @param to - The other.
 * @returns The Levenshtein distance.
 */
export const editDistance = (from: string, to: string): number => {
  let previous = Array.from({ length: to.length + 1 }, (_value, index) => index);
  for (let row = 1; row <= from.length; row++) {
    const current = [row];
    for (let column = 1; column <= to.length; column++) {
      const cost = from[row - 1] === to[column - 1] ? 0 : 1;
      current.push(
        Math.min(
          (previous[column] ?? 0) + 1,
          (current[column - 1] ?? 0) + 1,
          (previous[column - 1] ?? 0) + cost
        )
      );
    }
    previous = current;
  }
  return previous[to.length] ?? 0;
};

/**
 * The known words a typed word may have meant: the closest within two edits, or the one it starts.
 *
 * @param typed - What the user typed.
 * @param known - The words the command line knows.
 * @returns The suggestions, in the order of `known`; none when nothing is close.
 */
export const suggestions = (typed: string, known: readonly string[]): string[] => {
  const distances = known.map((word) => [word, editDistance(typed, word)] as const);
  const closest = Math.min(...distances.map(([, distance]) => distance));
  if (closest <= MAX_DISTANCE)
    return distances.filter(([, distance]) => distance === closest).map(([word]) => word);
  const started = known.filter((word) => word.startsWith(typed));
  return started.length === 1 ? started : [];
};

/**
 * The "Did you mean" sentence for a typed word, or an empty text when nothing is close.
 *
 * @param typed - What the user typed.
 * @param known - The words the command line knows, written as they would be typed (`--color`, `note`).
 * @returns ` Did you mean --color?` (with its leading space), or `""`.
 */
export const didYouMean = (typed: string, known: readonly string[]): string => {
  const found = suggestions(typed, known);
  if (found.length === 0) return "";
  const last = found.at(-1);
  const list = found.length === 1 ? found[0] : `${found.slice(0, -1).join(", ")} or ${String(last)}`;
  return ` Did you mean ${String(list)}?`;
};
