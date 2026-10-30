/**
 * Tests for the prompts: keys on a fake terminal, defaults and errors without one, `--yes`, Ctrl+C.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { EXIT } from "../src/constants.ts";
import { createLogger } from "../src/log.ts";
import { confirm, multiselect, secret, select, text } from "../src/prompts.ts";
import { ScriptError } from "../src/script.ts";
import { createTestIo } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

const KEYS = {
  up: "\u001B[A",
  down: "\u001B[B",
  enter: "\r",
  space: " ",
  backspace: "\u007F",
  ctrlC: "\u0003"
};

const setup = (tty: boolean, isYes = false) => {
  const test = createTestIo({ tty });
  const log = createLogger({ stdout: test.io.stdout, stderr: test.io.stderr });
  return { test, target: { io: test.io, log, isYes } };
};

/** Types keys one at a time on the next turns, as a person would. */
const press = async (test: ReturnType<typeof createTestIo>, ...keys: string[]): Promise<void> => {
  for (const key of keys) {
    await new Promise((resolve) => setImmediate(resolve));
    test.type(key);
  }
};

describe("without a terminal", () => {
  it("takes the defaults", async () => {
    const { target } = setup(false);
    expect(await confirm({ message: "Go?" }, target)).toBe(false);
    expect(await confirm({ message: "Go?", default: true }, target)).toBe(true);
    expect(await select({ message: "Env?", choices: ["dev", "prod"], default: "dev" }, target)).toBe("dev");
    expect(await multiselect({ message: "Which?", choices: ["a", "b"], default: ["b"] }, target)).toEqual([
      "b"
    ]);
    expect(await text({ message: "Name?", default: "radar" }, target)).toBe("radar");
  });

  it("fails with a usage error instead of hanging when there is no default", async () => {
    const { target } = setup(false);
    await expect(select({ message: "Env?", choices: ["dev"] }, target)).rejects.toMatchObject({
      exitCode: EXIT.usage,
      message: '"Env?" needs an answer and there is no terminal to ask'
    });
    await expect(text({ message: "Name?" }, target)).rejects.toBeInstanceOf(ScriptError);
    await expect(secret({ message: "Token?" }, target)).rejects.toBeInstanceOf(ScriptError);
  });

  it("answers yes and takes defaults with --yes, even on a terminal", async () => {
    const { target } = setup(true, true);
    expect(await confirm({ message: "Go?" }, target)).toBe(true);
    expect(await select({ message: "Env?", choices: ["dev", "prod"], default: "prod" }, target)).toBe("prod");
  });
});

describe("on a terminal", () => {
  it("confirm: y, n, Enter for the default, arrows to switch", async () => {
    const yes = setup(true);
    const answer = confirm({ message: "Deploy?" }, yes.target);
    await press(yes.test, "y");
    expect(await answer).toBe(true);
    expect(stripAnsi(yes.test.stderr())).toContain("✓ Deploy? yes\n");

    const toggled = setup(true);
    const second = confirm({ message: "Deploy?", default: true }, toggled.target);
    await press(toggled.test, "\u001B[D", KEYS.enter);
    expect(await second).toBe(false);
  });

  it("select: arrows move, wrap around, Enter picks", async () => {
    const { test, target } = setup(true);
    const answer = select(
      { message: "Env?", choices: ["dev", { value: "prod", label: "Production", hint: "careful" }, "test"] },
      target
    );
    await press(test, KEYS.down, KEYS.down, KEYS.down, KEYS.up, KEYS.enter);
    expect(await answer).toBe("test");
    const drawn = stripAnsi(test.stderr());
    expect(drawn).toContain("? Env?");
    expect(drawn).toContain("❯ Production careful");
  });

  it("multiselect: Space ticks, a toggles all, required is enforced", async () => {
    const { test, target } = setup(true);
    const answer = multiselect({ message: "Which?", choices: ["a", "b", "c"], required: true }, target);
    await press(test, KEYS.enter, KEYS.down, KEYS.space, KEYS.down, KEYS.space, KEYS.enter);
    expect(await answer).toEqual(["b", "c"]);
    expect(stripAnsi(test.stderr())).toContain("Tick at least one (Space).");

    const all = setup(true);
    const every = multiselect({ message: "Which?", choices: ["a", "b"] }, all.target);
    await press(all.test, "a", KEYS.enter);
    expect(await every).toEqual(["a", "b"]);
  });

  it("text: typing, Backspace, default when empty, validation", async () => {
    const typed = setup(true);
    const answer = text(
      { message: "Name?", validate: (value) => (value.length < 2 ? "Too short." : undefined) },
      typed.target
    );
    await press(typed.test, "a", KEYS.enter, "bc", KEYS.backspace, KEYS.enter);
    expect(await answer).toBe("ab");
    expect(stripAnsi(typed.test.stderr())).toContain("Too short.");

    const empty = setup(true);
    const fallback = text({ message: "Name?", default: "radar" }, empty.target);
    await press(empty.test, KEYS.enter);
    expect(await fallback).toBe("radar");
  });

  it("secret: shows dots, never the text", async () => {
    const { test, target } = setup(true);
    const answer = secret({ message: "Token?" }, target);
    await press(test, "s3cr3t", KEYS.enter);
    expect(await answer).toBe("s3cr3t");
    expect(test.stderr()).not.toContain("s3cr3t");
    expect(stripAnsi(test.stderr())).toContain("••••••");
  });

  it("Ctrl+C cancels with exit code 130 and restores the terminal", async () => {
    const { test, target } = setup(true);
    const answer = select({ message: "Env?", choices: ["dev"] }, target);
    await press(test, KEYS.ctrlC);
    await expect(answer).rejects.toMatchObject({ exitCode: EXIT.interrupted, message: "cancelled" });
    expect(test.stderr().endsWith("\u001B[?25h")).toBe(true);
  });
});
