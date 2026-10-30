/**
 * The types of the script catalogue: the `scripts.json` list and what `cli-kit docs` collects from it.
 *
 * @module
 */
import type { ScriptDescription } from "./docs.types.ts";

/** One entry of `scripts.json`. */
export interface CatalogEntry {
  /** The script's file, from the repo root. */
  readonly path: string;
  /** Also write a man page for it (`docs/man/<name>.1`), for commands that are installed. @defaultValue false */
  readonly man?: boolean | undefined;
}

/** A listed script with its description. */
export interface CatalogScript {
  /** The entry as listed. */
  readonly entry: CatalogEntry;
  /** What the script printed with `CLI_KIT_DESCRIBE=1`. */
  readonly description: ScriptDescription;
}

/** The files `cli-kit docs` generates, by path from the repo root. */
export type GeneratedDocs = ReadonlyMap<string, string>;
