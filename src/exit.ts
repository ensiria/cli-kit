/**
 * Cleanups that always run: when the script ends, when it fails and when it is stopped with Ctrl+C or SIGTERM.
 *
 * @remarks
 * `defineScript` gives `run` an `onExit(cleanup)`; temporary files, child processes and live output register there.
 * On a signal the cleanups run (last registered first), the cursor is shown again on a terminal, and the process
 * exits with 130 (SIGINT) or 143 (SIGTERM).
 *
 * @module
 */
import { ANSI, EXIT } from "./constants.ts";
import type { Cleanup, ExitHooks } from "./exit.types.ts";
import type { ExitSignal, ScriptIo } from "./io.types.ts";

/** The exit code for each handled signal. */
const SIGNAL_EXIT: Readonly<Record<ExitSignal, number>> = {
  SIGINT: EXIT.interrupted,
  SIGTERM: EXIT.terminated
};

/** The signals listened for during a run. */
const HANDLED: readonly ExitSignal[] = ["SIGINT", "SIGTERM"];

/**
 * Creates the cleanup list of one run.
 *
 * @returns The hooks.
 */
export const createExitHooks = (): ExitHooks => {
  const cleanups: Cleanup[] = [];
  return {
    add: (cleanup: Cleanup): (() => void) => {
      cleanups.push(cleanup);
      return (): void => {
        const index = cleanups.indexOf(cleanup);
        if (index >= 0) cleanups.splice(index, 1);
      };
    },
    runAll: async (): Promise<unknown[]> => {
      const errors: unknown[] = [];
      for (let cleanup = cleanups.pop(); cleanup; cleanup = cleanups.pop()) {
        try {
          await cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      return errors;
    }
  };
};

/**
 * Listens for Ctrl+C and SIGTERM during a run.
 *
 * @param io - Where the signals come from and where the cursor is restored.
 * @param onSignal - Called once with the signal's exit code (it runs the cleanups and ends the run).
 * @returns A function that stops listening.
 */
export const listenForSignals = (io: ScriptIo, onSignal: (exitCode: number) => void): (() => void) => {
  const listeners = HANDLED.map((signal) => {
    const listener = (): void => {
      if (io.stdout.isTTY) io.stdout.write(ANSI.showCursor);
      if (io.stderr.isTTY) io.stderr.write(`${ANSI.showCursor}\n`);
      onSignal(SIGNAL_EXIT[signal]);
    };
    io.signals.on(signal, listener);
    return { signal, listener };
  });
  return (): void => {
    for (const { signal, listener } of listeners) io.signals.off(signal, listener);
  };
};
