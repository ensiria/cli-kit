/**
 * References to notes that live outside this repository: the decision ids and numbered notes of its author's private
 * index, and the private repository it was extracted from. They mean nothing to a reader of this public repository, so
 * no file and no commit message carries them; a comment says the reason itself.
 *
 * @remarks
 * Pure: the file check (`check-internal-refs.mts`) and the commit check (`check-commits`) read text with it.
 *
 * @module
 */

/** What a reference points at. */
export type InternalReferenceKind = "decision id" | "numbered note" | "private repository";

/** A reference found in a text. */
export type InternalReference = {
  /** What it points at. */
  readonly kind: InternalReferenceKind;
  /** The text as written. */
  readonly text: string;
};

/** Each kind's pattern: a decision id (`D-469`), a numbered note (`note 142`), the private repository's name. */
const PATTERNS: readonly { readonly kind: InternalReferenceKind; readonly pattern: RegExp }[] = [
  { kind: "decision id", pattern: /\(D-\d+\)|\bD-\d+\b/g },
  { kind: "numbered note", pattern: /\bnotes? \d+\b/gi },
  { kind: "private repository", pattern: /\bdev-tooling\b/g }
];

/**
 * The internal references in a text, in the order of the patterns, then of the text.
 *
 * @param text - the text.
 */
export const internalReferences = (text: string): InternalReference[] =>
  PATTERNS.flatMap(({ kind, pattern }) =>
    [...text.matchAll(pattern)].map((match) => ({ kind, text: match[0] }))
  );
