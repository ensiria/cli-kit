/**
 * Tests for values checked by a schema (Standard Schema, zod here): the schema's output typed in `run`, async
 * validators awaited, each value of a list checked, positionals too, and issues as usage errors naming the option.
 *
 * @module
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { defineCommands } from "../src/commands.ts";
import { EXIT } from "../src/constants.ts";
import { defineScript } from "../src/script.ts";
import { runScript } from "../src/testing.ts";

/** What the scripts saw. */
const seen: unknown[] = [];

/** A JSON body read and checked by its schema. */
const BODY = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      context.addIssue({ code: "custom", message: "is not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.object({ title: z.string(), tags: z.array(z.string()).default([]) }));

/** A schema that answers later, as one that asks a server would. */
const KNOWN_USER = z.string().refine(async (name) => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  return name !== "nobody";
}, "is not a known user");

const post = defineScript({
  name: "post",
  command: "post",
  summary: "Post a note.",
  header: false,
  options: {
    body: { type: "string", required: true, schema: BODY, description: "The note, as JSON." },
    author: { type: "string", schema: KNOWN_USER, description: "Who writes it." },
    mention: { type: "string", multiple: true, schema: z.string().regex(/^@/), description: "A mention." }
  },
  positionals: [
    { name: "id", required: true, schema: z.string().transform(Number).pipe(z.int()), description: "The id." }
  ],
  run: ({ options, args }) => {
    expectTypeOf(options.body).toEqualTypeOf<{ title: string; tags: string[] }>();
    expectTypeOf(options.author).toEqualTypeOf<string | undefined>();
    expectTypeOf(options.mention).toEqualTypeOf<string[]>();
    expectTypeOf(args.id).toEqualTypeOf<number>();
    seen.push({ ...options, id: args.id });
  }
});

describe("schemas", () => {
  it("gives run what the schemas give, typed: parsed JSON, a number, each item of a list checked", async () => {
    seen.length = 0;
    const run = await runScript(post, [
      "7",
      "--body",
      '{"title":"Hi"}',
      "--author",
      "ada",
      "--mention",
      "@bob",
      "--mention",
      "@eve"
    ]);
    expect(run.exitCode).toBe(EXIT.ok);
    expect(seen).toEqual([
      { body: { title: "Hi", tags: [] }, author: "ada", mention: ["@bob", "@eve"], id: 7 }
    ]);
  });

  it("turns issues into a usage error naming the option, with each issue's path", async () => {
    const notJson = await runScript(post, ["1", "--body", "{"]);
    expect(notJson.exitCode).toBe(EXIT.usage);
    expect(notJson.stderr).toContain("--body: is not JSON");
    const missingTitle = await runScript(post, ["1", "--body", "{}"]);
    expect(missingTitle.stderr).toMatch(/--body: title: /);
    const badMention = await runScript(post, ["1", "--body", '{"title":"x"}', "--mention", "bob"]);
    expect(badMention.stderr).toContain("--mention: ");
    const badId = await runScript(post, ["one", "--body", '{"title":"x"}']);
    expect(badId.stderr).toContain("<id>: ");
  });

  it("awaits an async schema before run", async () => {
    const run = await runScript(post, ["1", "--body", '{"title":"x"}', "--author", "nobody"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("--author: is not a known user");
  });

  it("checks a subcommand's values the same way", async () => {
    seen.length = 0;
    const kb = defineCommands({
      name: "kb",
      command: "kb",
      summary: "Notes.",
      header: false,
      commands: (top) => ({
        add: top.command({
          summary: "Add.",
          options: { body: { type: "string", required: true, schema: BODY, description: "The note." } },
          run: ({ options }) => {
            expectTypeOf(options.body.title).toEqualTypeOf<string>();
            seen.push(options.body.title);
          }
        })
      })
    });
    expect((await runScript(kb, ["add", "--body", '{"title":"Deep"}'])).exitCode).toBe(EXIT.ok);
    expect(seen).toEqual(["Deep"]);
  });

  it("refuses a schema on an option that is not a string", () => {
    expect(() =>
      defineScript({
        name: "x",
        command: "x",
        summary: "X.",
        options: { n: { type: "number", schema: z.string(), description: "N." } },
        run: () => undefined
      })
    ).toThrow("x: --n is not a string option: a schema checks a string");
  });
});
