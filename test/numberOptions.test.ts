/**
 * Tests for number options: parsed to numbers, checked against their range and wholeness, from the command line, the
 * environment or the default, one or many, and shown with their range in the help and the JSON description.
 *
 * @module
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { EXIT } from "../src/constants.ts";
import { formatHelpJson } from "../src/docs.ts";
import { defineScript } from "../src/script.ts";
import { runScript } from "../src/testing.ts";

/** What the script saw. */
const seen: unknown[] = [];

/** A script with a ranged timeout, a whole-number count, and a list of ports. */
const wait = defineScript({
  name: "wait",
  command: "wait",
  summary: "Wait for a service.",
  header: false,
  options: {
    timeout: {
      type: "number",
      min: 0,
      max: 600,
      default: 30,
      env: "WAIT_TIMEOUT",
      valueName: "seconds",
      description: "How long to wait."
    },
    count: { type: "number", short: "n", integer: true, min: 1, description: "How many tries." },
    port: { type: "number", multiple: true, integer: true, description: "A port to check." }
  },
  run: ({ options }) => {
    expectTypeOf(options.timeout).toEqualTypeOf<number>();
    expectTypeOf(options.count).toEqualTypeOf<number | undefined>();
    expectTypeOf(options.port).toEqualTypeOf<number[]>();
    seen.push(options);
  }
});

describe("number options", () => {
  it("parses numbers, takes the default, and reads many", async () => {
    seen.length = 0;
    expect(
      (await runScript(wait, ["--timeout", "2.5", "-n", "3", "--port", "80", "--port=443"])).exitCode
    ).toBe(EXIT.ok);
    expect((await runScript(wait, [])).exitCode).toBe(EXIT.ok);
    expect(seen).toEqual([
      { timeout: 2.5, count: 3, port: [80, 443] },
      { timeout: 30, count: undefined, port: [] }
    ]);
  });

  it("reads the environment variable as a number, and names it when it is wrong", async () => {
    seen.length = 0;
    await runScript(wait, [], { env: { WAIT_TIMEOUT: "60" } });
    expect(seen).toEqual([{ timeout: 60, count: undefined, port: [] }]);
    const run = await runScript(wait, [], { env: { WAIT_TIMEOUT: "soon" } });
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain('WAIT_TIMEOUT must be a number (got "soon")');
  });

  it("refuses what is not a number, out of range, or not whole, as usage errors naming the option", async () => {
    const cases: [readonly string[], string][] = [
      [["--timeout", "abc"], '--timeout must be a number (got "abc")'],
      [["--timeout", "601"], "--timeout must be between 0 and 600 (got 601)"],
      [["-n", "0"], "--count must be at least 1 (got 0)"],
      [["-n", "1.5"], "--count must be a whole number (got 1.5)"],
      [["--port", "80", "--port", "x"], '--port must be a number (got "x")']
    ];
    for (const [argv, message] of cases) {
      const run = await runScript(wait, argv);
      expect(run.exitCode).toBe(EXIT.usage);
      expect(run.stderr).toContain(message);
    }
  });

  it("shows the range in the help and the JSON description", () => {
    expect(wait.help()).toMatch(
      /--timeout <seconds> +How long to wait\. \(0-600; default: 30; env: WAIT_TIMEOUT\)/
    );
    expect(wait.help()).toMatch(/-n, --count <number> +How many tries\. \(at least 1; whole number\)/);
    const timeout = formatHelpJson(wait.source).options.find((option) => option.name === "timeout");
    expect(timeout).toMatchObject({ type: "number", min: 0, max: 600, integer: false, default: 30 });
  });

  it("refuses a declaration that cannot work: a default out of range, choices, a string default", () => {
    const define = (option: Parameters<typeof defineScript>[0]["options"]): unknown =>
      defineScript({ name: "x", command: "x", summary: "X.", options: option, run: () => undefined });
    expect(() => define({ n: { type: "number", min: 1, default: 0, description: "N." } })).toThrow(
      "x: --n must be at least 1 (got 0)"
    );
    expect(() => define({ n: { type: "number", choices: ["1"], description: "N." } })).toThrow(
      "x: --n is a number option: give it min and max, not choices"
    );
    expect(() => define({ n: { type: "number", default: "1", description: "N." } })).toThrow(
      "x: --n is a number option: its default is a number"
    );
    expect(() => define({ s: { type: "string", min: 1, description: "S." } })).toThrow(
      "x: --s is not a number option"
    );
  });
});
