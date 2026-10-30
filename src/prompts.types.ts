/**
 * The types of the prompts.
 *
 * @module
 */
import type { LiveTarget } from "./live.types.ts";

/** What a prompt needs from the run: a script passes its context, which has `isYes` from `--yes`. */
export interface PromptTarget extends LiveTarget {
  /** Whether `--yes` was given: confirmations answer yes, other prompts take their default. */
  readonly isYes?: boolean | undefined;
}

/** A choice of `select` / `multiselect`: a value, or a value with its label and a hint. */
export type PromptChoice<TValue extends string> =
  | TValue
  | { readonly value: TValue; readonly label?: string | undefined; readonly hint?: string | undefined };

/** Options of `confirm`. */
export interface ConfirmOptions {
  /** The question. */
  readonly message: string;
  /** The answer when Enter is pressed, and without a terminal. @defaultValue false */
  readonly default?: boolean | undefined;
}

/** Options of `select`. */
export interface SelectOptions<TValue extends string> {
  /** The question. */
  readonly message: string;
  /** The choices, in order. */
  readonly choices: readonly PromptChoice<TValue>[];
  /** The choice selected first, and the answer without a terminal. */
  readonly default?: TValue | undefined;
}

/** Options of `multiselect`. */
export interface MultiselectOptions<TValue extends string> {
  /** The question. */
  readonly message: string;
  /** The choices, in order. */
  readonly choices: readonly PromptChoice<TValue>[];
  /** The choices ticked first, and the answer without a terminal. */
  readonly default?: readonly TValue[] | undefined;
  /** Whether at least one choice must be ticked. @defaultValue false */
  readonly required?: boolean | undefined;
}

/** Options of `text`. */
export interface TextOptions {
  /** The question. */
  readonly message: string;
  /** The answer when the input is left empty, and without a terminal. */
  readonly default?: string | undefined;
  /** Returns a message when the answer is not acceptable. */
  readonly validate?: ((value: string) => string | undefined) | undefined;
}

/** Options of `secret`: like `text`, the typing hidden, never a default (pass secrets by an `env` option). */
export interface SecretOptions {
  /** The question. */
  readonly message: string;
  /** Returns a message when the answer is not acceptable. */
  readonly validate?: ((value: string) => string | undefined) | undefined;
}
