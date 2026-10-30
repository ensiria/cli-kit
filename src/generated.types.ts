/**
 * The public types of `generated`.
 *
 * @module
 */

/** How `writeGenerated` treats a file. */
export interface GeneratedFileOptions {
  /** Whether to only check the file is up to date (`--check`, in CI), never writing it. */
  readonly isCheck: boolean;
  /** The command that brings the file up to date, for the hint of a failed check (`pnpm docs`). */
  readonly command: string;
  /** The folder the file's path is shown from in messages; the path as given by default. */
  readonly cwd?: string | undefined;
}

/** What became of a generated file: written because it changed, or unchanged. */
export type GeneratedFileResult = "written" | "unchanged";
