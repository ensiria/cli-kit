/**
 * The public types of `version`.
 *
 * @module
 */

/** A version, read from a program's output. */
export interface Version {
  /** The major number. */
  readonly major: number;
  /** The minor number. */
  readonly minor: number;
  /** The patch number; 0 when the text gave none. */
  readonly patch: number;
  /** What follows a `-` (`beta.2`); none for a release. */
  readonly prerelease?: string | undefined;
}
