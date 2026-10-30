/**
 * Questions on the terminal: `confirm`, `select`, `multiselect`, `text`, `secret`, on `node:readline`.
 *
 * @remarks
 * Drawn on stderr with the kit's glyphs and tones, keys read in raw mode. Every prompt has a non-interactive answer:
 * without a terminal (a pipe, CI) or with `--yes` it takes its default (a confirmation answers yes with `--yes`), and
 * when it has none it fails with a usage error instead of hanging. Ctrl+C cancels and exits with 130.
 *
 * @module
 */
import { emitKeypressEvents } from "node:readline";

import { EXIT } from "./constants.ts";
import { glyph } from "./glyphs.ts";
import { isInteractive } from "./io.ts";
import { createLiveRegion } from "./live.ts";
import type {
  ConfirmOptions,
  MultiselectOptions,
  PromptChoice,
  PromptTarget,
  SecretOptions,
  SelectOptions,
  TextOptions
} from "./prompts.types.ts";
import { ScriptError, usageError } from "./script.ts";
import { paint } from "./style.ts";

/** A key press as readline reports it. */
interface KeyPress {
  /** The key's name (`up`, `return`, `space`, `backspace`, a letter). */
  readonly name?: string | undefined;
  /** Whether Ctrl was held. */
  readonly ctrl?: boolean | undefined;
}

/** What a prompt's key handler decides. */
type KeyOutcome<TState, TResult> =
  | { readonly kind: "update"; readonly state: TState }
  | { readonly kind: "submit"; readonly result: TResult; readonly summary: string }
  | { readonly kind: "invalid"; readonly state: TState; readonly message: string };

/** One interactive prompt: its state, how it draws and how keys change it. */
interface PromptEngine<TState, TResult> {
  /** The question. */
  readonly message: string;
  /** The state before any key. */
  readonly initial: TState;
  /** The lines under the question. */
  readonly body: (state: TState) => string[];
  /** What a key does. */
  readonly onKey: (state: TState, text: string, key: KeyPress) => KeyOutcome<TState, TResult>;
}

/** Whether the prompt can ask: stdin and stderr are an interactive terminal. */
const canAsk = (target: PromptTarget): boolean =>
  target.io.stdin.isTTY === true && isInteractive(target.io.stderr, target.io.env);

/** The answer without a terminal: the default, or a usage error. */
const fallback = <TResult>(message: string, value: TResult | undefined): TResult => {
  if (value !== undefined) return value;
  throw usageError(`"${message}" needs an answer and there is no terminal to ask`);
};

/** The value, label and hint of a choice. */
const normalise = <TValue extends string>(
  choice: PromptChoice<TValue>
): { value: TValue; label: string; hint: string } =>
  typeof choice === "string"
    ? { value: choice, label: choice, hint: "" }
    : { value: choice.value, label: choice.label ?? choice.value, hint: choice.hint ?? "" };

/** Runs an interactive prompt until it is submitted or cancelled. */
const ask = <TState, TResult>(
  engine: PromptEngine<TState, TResult>,
  target: PromptTarget
): Promise<TResult> => {
  const { stdin, stderr } = target.io;
  const { color, unicode } = target.log.errorStyle;
  const region = createLiveRegion(stderr, unicode);
  const question = `${paint("accent", glyph("question", unicode), color)} ${paint("strong", engine.message, color)}`;
  return new Promise<TResult>((resolve, reject) => {
    let state = engine.initial;
    let problem = "";
    const draw = (): void => {
      const lines = [question, ...engine.body(state)];
      if (problem) lines.push(`  ${paint("warning", problem, color)}`);
      region.render(lines);
    };
    const finish = (): void => {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode?.(false);
      stdin.pause();
      region.clear();
      removeCleanup();
    };
    const onKeypress = (text: string | undefined, key: KeyPress | undefined): void => {
      const press = key ?? {};
      if (press.ctrl && press.name === "c") {
        finish();
        reject(new ScriptError("cancelled", { exitCode: EXIT.interrupted }));
        return;
      }
      const outcome = engine.onKey(state, text ?? "", press);
      if (outcome.kind === "submit") {
        finish();
        stderr.write(
          `${paint("success", glyph("success", unicode), color)} ${engine.message} ${paint("muted", outcome.summary, color)}\n`
        );
        resolve(outcome.result);
        return;
      }
      state = outcome.state;
      problem = outcome.kind === "invalid" ? outcome.message : "";
      draw();
    };
    const removeCleanup = target.onExit?.(finish) ?? ((): void => undefined);
    emitKeypressEvents(stdin);
    stdin.setRawMode?.(true);
    stdin.on("keypress", onKeypress);
    stdin.resume();
    draw();
  });
};

/** Whether the key submits (Return or Enter). */
const isEnter = (key: KeyPress): boolean => key.name === "return" || key.name === "enter";

/** The index after a move up or down, wrapping around. */
const move = (index: number, count: number, key: KeyPress): number => {
  if (key.name === "up" || key.name === "k") return (index - 1 + count) % count;
  if (key.name === "down" || key.name === "j") return (index + 1) % count;
  return index;
};

/**
 * Asks a yes/no question.
 *
 * @param options - The question and the default.
 * @param target - The run: a script passes its context.
 * @returns The answer; `--yes` answers true, no terminal answers the default.
 */
export const confirm = async (options: ConfirmOptions, target: PromptTarget): Promise<boolean> => {
  if (target.isYes) return true;
  if (!canAsk(target)) return options.default ?? false;
  const { color } = target.log.errorStyle;
  return ask<boolean, boolean>(
    {
      message: options.message,
      initial: options.default ?? false,
      body: (value: boolean): string[] => [
        `  ${value ? paint("accent", "Yes", color) : "Yes"} / ${value ? "No" : paint("accent", "No", color)}`
      ],
      onKey: (value: boolean, text: string, key: KeyPress): KeyOutcome<boolean, boolean> => {
        if (isEnter(key)) return { kind: "submit", result: value, summary: value ? "yes" : "no" };
        if (text.toLowerCase() === "y") return { kind: "submit", result: true, summary: "yes" };
        if (text.toLowerCase() === "n") return { kind: "submit", result: false, summary: "no" };
        if (["left", "right", "tab", "space"].includes(key.name ?? ""))
          return { kind: "update", state: !value };
        return { kind: "update", state: value };
      }
    },
    target
  );
};

/**
 * Asks to pick one choice (arrows or j/k, Enter).
 *
 * @param options - The question, the choices and the default.
 * @param target - The run: a script passes its context.
 * @returns The chosen value; `--yes` or no terminal take the default, or fail with a usage error without one.
 */
export const select = async <TValue extends string>(
  options: SelectOptions<TValue>,
  target: PromptTarget
): Promise<TValue> => {
  if (target.isYes || !canAsk(target)) return fallback(options.message, options.default);
  const choices = options.choices.map(normalise);
  if (choices.length === 0) throw new Error(`select "${options.message}" has no choices`);
  const { color, unicode } = target.log.errorStyle;
  const start = Math.max(
    0,
    choices.findIndex((choice) => choice.value === options.default)
  );
  return ask<number, TValue>(
    {
      message: options.message,
      initial: start,
      body: (active: number): string[] =>
        choices.map((choice, index) => {
          const isActive = index === active;
          const pointer = isActive ? paint("accent", glyph("pointer", unicode), color) : " ";
          const hint = choice.hint ? ` ${paint("muted", choice.hint, color)}` : "";
          return `${pointer} ${isActive ? paint("accent", choice.label, color) : choice.label}${hint}`;
        }),
      onKey: (active: number, _text: string, key: KeyPress): KeyOutcome<number, TValue> => {
        const choice = choices[active];
        if (isEnter(key) && choice) {
          return { kind: "submit", result: choice.value, summary: choice.label };
        }
        return { kind: "update", state: move(active, choices.length, key) };
      }
    },
    target
  );
};

/** The state of a multiselect: the cursor and the ticked indexes. */
interface MultiselectState {
  /** The row under the cursor. */
  readonly active: number;
  /** The ticked rows. */
  readonly ticked: ReadonlySet<number>;
}

/** Ticks or unticks one row. */
const toggle = (ticked: ReadonlySet<number>, index: number): Set<number> => {
  const next = new Set(ticked);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
};

/** The key handler of `multiselect`: Space ticks, `a` toggles all, arrows move, Enter submits. */
const multiselectKey =
  <TValue extends string>(
    choices: readonly { value: TValue; label: string }[],
    isRequired: boolean
  ): ((state: MultiselectState, text: string, key: KeyPress) => KeyOutcome<MultiselectState, TValue[]>) =>
  (state: MultiselectState, text: string, key: KeyPress): KeyOutcome<MultiselectState, TValue[]> => {
    if (isEnter(key)) {
      if (isRequired && state.ticked.size === 0) {
        return { kind: "invalid", state, message: "Tick at least one (Space)." };
      }
      const picked = choices.filter((_, index) => state.ticked.has(index));
      const summary = picked.map((choice) => choice.label).join(", ");
      return { kind: "submit", result: picked.map((choice) => choice.value), summary };
    }
    if (key.name === "space")
      return { kind: "update", state: { ...state, ticked: toggle(state.ticked, state.active) } };
    if (text === "a") {
      const isAll = state.ticked.size === choices.length;
      return {
        kind: "update",
        state: { ...state, ticked: new Set(isAll ? [] : choices.map((_, index) => index)) }
      };
    }
    return { kind: "update", state: { ...state, active: move(state.active, choices.length, key) } };
  };

/**
 * Asks to tick any number of choices (Space ticks, `a` toggles all, Enter submits).
 *
 * @param options - The question, the choices, the default and whether one is required.
 * @param target - The run: a script passes its context.
 * @returns The ticked values in choice order; `--yes` or no terminal take the default, or fail without one.
 */
export const multiselect = async <TValue extends string>(
  options: MultiselectOptions<TValue>,
  target: PromptTarget
): Promise<TValue[]> => {
  if (target.isYes || !canAsk(target)) {
    return [...fallback(options.message, options.default)];
  }
  const choices = options.choices.map(normalise);
  const { color, unicode } = target.log.errorStyle;
  const initial = new Set(
    choices.flatMap((choice, index) => (options.default?.includes(choice.value) ? [index] : []))
  );
  return ask<MultiselectState, TValue[]>(
    {
      message: options.message,
      initial: { active: 0, ticked: initial },
      body: (state: MultiselectState): string[] =>
        choices.map((choice, index) => {
          const isActive = index === state.active;
          const pointer = isActive ? paint("accent", glyph("pointer", unicode), color) : " ";
          const box = state.ticked.has(index)
            ? paint("success", glyph("checked", unicode), color)
            : glyph("unchecked", unicode);
          const hint = choice.hint ? ` ${paint("muted", choice.hint, color)}` : "";
          return `${pointer} ${box} ${choice.label}${hint}`;
        }),
      onKey: multiselectKey(choices, options.required ?? false)
    },
    target
  );
};

/** Keys that never change typed text. */
const IGNORED_KEYS: readonly string[] = ["escape", "up", "down", "left", "right", "tab"];

/** The text after a key that edits it: Backspace removes a character, printable keys add theirs. */
const edit = (value: string, text: string, key: KeyPress): string => {
  if (key.name === "backspace") return Array.from(value).slice(0, -1).join("");
  if (key.ctrl || IGNORED_KEYS.includes(key.name ?? "")) return value;
  return `${value}${text.replace(/[\r\n]/g, "")}`;
};

/** The key handler shared by `text` and `secret`: typing, Backspace, Enter with validation. */
const typing =
  (
    validate: ((value: string) => string | undefined) | undefined,
    fallbackValue: string | undefined,
    mask: string | undefined
  ): ((value: string, text: string, key: KeyPress) => KeyOutcome<string, string>) =>
  (value: string, text: string, key: KeyPress): KeyOutcome<string, string> => {
    if (!isEnter(key)) return { kind: "update", state: edit(value, text, key) };
    const answer = value === "" ? (fallbackValue ?? "") : value;
    const problem = validate?.(answer);
    if (problem) return { kind: "invalid", state: value, message: problem };
    return {
      kind: "submit",
      result: answer,
      summary: mask ? mask.repeat(Math.min(answer.length, 8)) : answer
    };
  };

/**
 * Asks for a line of text.
 *
 * @param options - The question, the default and a validator.
 * @param target - The run: a script passes its context.
 * @returns The answer (the default when left empty); `--yes` or no terminal take the default, or fail without one.
 */
export const text = async (options: TextOptions, target: PromptTarget): Promise<string> => {
  if (target.isYes || !canAsk(target)) return fallback(options.message, options.default);
  const { color } = target.log.errorStyle;
  return ask<string, string>(
    {
      message: options.message,
      initial: "",
      body: (value: string): string[] => [`  ${value || paint("muted", options.default ?? "", color)}`],
      onKey: typing(options.validate, options.default, undefined)
    },
    target
  );
};

/**
 * Asks for a secret (a token, a password): the typing shows as dots.
 *
 * @param options - The question and a validator.
 * @param target - The run: a script passes its context.
 * @returns The answer; without a terminal it fails with a usage error (pass secrets by an `env` option instead).
 */
export const secret = async (options: SecretOptions, target: PromptTarget): Promise<string> => {
  if (!canAsk(target)) return fallback<string>(options.message, undefined);
  const dot = glyph("bullet", target.log.errorStyle.unicode);
  return ask<string, string>(
    {
      message: options.message,
      initial: "",
      body: (value: string): string[] => [`  ${dot.repeat(Array.from(value).length)}`],
      onKey: typing(options.validate, undefined, dot)
    },
    target
  );
};
