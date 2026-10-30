/**
 * The types of the cleanups a run registers.
 *
 * @module
 */

/** A cleanup: may be async; its errors are reported, never thrown. */
export type Cleanup = () => void | Promise<void>;

/** The cleanups of one run. */
export interface ExitHooks {
  /** Registers a cleanup; returns a function that removes it (when the resource was released early). */
  add: (cleanup: Cleanup) => () => void;
  /** Runs every cleanup once, last registered first; returns the errors they threw. */
  runAll: () => Promise<unknown[]>;
}
