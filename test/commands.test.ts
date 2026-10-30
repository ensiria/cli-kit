/**
 * Tests for `defineCommands`: commands at any depth, options shared by groups, help per level, the tree's docs, man
 * page and completions, `--json`, inherited settings and renamed commands.
 *
 * @module
 */
import { describe, expect, expectTypeOf, it } from "vitest";

import { defineCommands } from "../src/commands.ts";
import { EXIT } from "../src/constants.ts";
import { formatCompletion, formatHelpJson, formatHelpMan } from "../src/docs.ts";
import { runScript } from "../src/testing.ts";

/** What the commands of the test tree saw, by the command called. */
const seen: Record<string, unknown>[] = [];

/** A knowledge base: a top option, a group with its own option, a command three levels down, a renamed command. */
const kb = defineCommands({
  name: "kb",
  command: "kb",
  summary: "Notes and plans.",
  version: "1.2.0",
  options: { project: { type: "string", short: "p", description: "The project." } },
  aliases: { "re-index": "reindex" },
  commands: (top) => ({
    reindex: top.command({
      summary: "Rebuild the index.",
      json: true,
      run: ({ options, path }) => {
        seen.push({ path, project: options.project });
        return { indexed: 3 };
      }
    }),
    plan: top.group({
      summary: "The plans.",
      options: { tag: { type: "string", description: "A tag." } },
      commands: (plan) => ({
        step: plan.group({
          summary: "A plan's steps.",
          commands: (step) => ({
            follow: step.command({
              summary: "Follow a step.",
              options: { force: { type: "boolean", short: "f", description: "Even when done." } },
              positionals: [{ name: "step", description: "The step.", required: true }],
              examples: [{ command: "kb plan step follow 2 --force", description: "Follow step 2 again." }],
              run: ({ options, args, path }) => {
                expectTypeOf(options.project).toEqualTypeOf<string | undefined>();
                expectTypeOf(options.tag).toEqualTypeOf<string | undefined>();
                expectTypeOf(options.force).toEqualTypeOf<boolean>();
                expectTypeOf(args.step).toEqualTypeOf<string>();
                seen.push({
                  path,
                  project: options.project,
                  tag: options.tag,
                  force: options.force,
                  step: args.step
                });
              }
            })
          })
        })
      })
    })
  })
});

describe("dispatch", () => {
  it("runs a command at depth 1 and at depth 3, with the path it was called through", async () => {
    seen.length = 0;
    expect((await runScript(kb, ["reindex", "-p", "radar"])).exitCode).toBe(EXIT.ok);
    expect((await runScript(kb, ["plan", "step", "follow", "2"])).exitCode).toBe(EXIT.ok);
    expect(seen).toEqual([
      { path: ["reindex"], project: "radar" },
      { path: ["plan", "step", "follow"], project: undefined, tag: undefined, force: false, step: "2" }
    ]);
  });

  it("takes a group's options before or after the command words, and a command's own after", async () => {
    seen.length = 0;
    await runScript(kb, ["--project", "radar", "plan", "--tag", "ui", "step", "follow", "4", "-f"]);
    await runScript(kb, ["plan", "step", "follow", "4", "--tag", "ui", "--project=radar", "--force"]);
    expect(seen).toEqual([
      { path: ["plan", "step", "follow"], project: "radar", tag: "ui", force: true, step: "4" },
      { path: ["plan", "step", "follow"], project: "radar", tag: "ui", force: true, step: "4" }
    ]);
  });

  it("prints the whole path in the header", async () => {
    const run = await runScript(kb, ["plan", "step", "follow", "1"]);
    expect(run.stderr).toContain("kb plan step follow");
  });

  it("calls a group without a command a usage error that lists its commands", async () => {
    const run = await runScript(kb, ["plan"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("kb plan needs a command");
    expect(run.stderr).toContain("Commands: step");
  });

  it("names an unknown command word and lists the group's commands", async () => {
    const run = await runScript(kb, ["plan", "stepz"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("unknown command stepz");
    expect(run.stderr).toContain("kb plan has: step");
  });

  it("still runs a renamed command by its old name, with a note on stderr", async () => {
    seen.length = 0;
    const run = await runScript(kb, ["re-index"]);
    expect(run.exitCode).toBe(EXIT.ok);
    expect(run.stderr).toContain("re-index is now reindex");
    expect(seen).toEqual([{ path: ["reindex"], project: undefined }]);
  });

  it("prints a command's result as JSON with --json, and the version at the top", async () => {
    expect((await runScript(kb, ["reindex", "--json"])).stdout).toBe('{\n  "indexed": 3\n}\n');
    expect((await runScript(kb, ["--version"])).stdout).toBe("1.2.0\n");
  });

  it("checks a command's arguments as a script does", async () => {
    const run = await runScript(kb, ["plan", "step", "follow"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("missing argument <step>");
  });
});

describe("help", () => {
  it("prints each level's help: the top's commands, a group's, a command's options and inherited ones", async () => {
    const top = await runScript(kb, ["--help"]);
    expect(top.exitCode).toBe(EXIT.ok);
    expect(top.stdout).toContain("kb <command> [options]");
    expect(top.stdout).toMatch(/Commands\n {2}reindex +Rebuild the index\.\n {2}plan +The plans\./);
    expect(top.stdout).toContain("re-index  now reindex");
    const group = await runScript(kb, ["plan", "--help"]);
    expect(group.stdout).toContain("kb plan <command> [options]");
    expect(group.stdout).toMatch(/Commands\n {2}step +A plan's steps\./);
    const command = await runScript(kb, ["plan", "step", "follow", "--help"]);
    expect(command.stdout).toContain("kb plan step follow [options] <step>");
    expect(command.stdout).toMatch(/Options\n.*--force/);
    expect(command.stdout).toMatch(/Inherited options\n.*--project[\s\S]*--tag/);
  });
});

describe("the tree's docs", () => {
  it("describes every command in the JSON, each with its inherited options", () => {
    const description = formatHelpJson(kb.source);
    const plan = description.commands.find((command) => command.name === "plan");
    const follow = plan?.commands[0]?.commands[0];
    expect(description.aliases).toEqual({ "re-index": "reindex" });
    expect(follow?.command).toBe("kb plan step follow");
    expect(follow?.inheritedOptions.map((option) => option.name)).toEqual(["project", "tag"]);
    expect(follow?.options.map((option) => option.name)).toContain("force");
  });

  it("writes every command in the Markdown and the man page", () => {
    const markdown = kb.markdown();
    expect(markdown).toContain("### `kb plan step follow`");
    expect(markdown).toContain("| `-p, --project <value>` | The project. (inherited) |");
    const man = formatHelpMan(kb.source);
    expect(man).toContain(".SH COMMANDS");
    expect(man).toContain('.SS "kb plan step follow"');
  });

  it("completes the command words, then the options of the command they lead to", () => {
    const bash = formatCompletion(kb.source, "bash");
    expect(bash).toContain("'') words='reindex plan --project -p");
    expect(bash).toContain("' plan step follow') words='--project -p --tag --force -f");
    const zsh = formatCompletion(kb.source, "zsh");
    expect(zsh).toContain("' plan') offered=('step'");
    const fish = formatCompletion(kb.source, "fish");
    expect(fish).toContain("-a 'step'");
    expect(fish).toContain("-l force -s f -d 'Even when done.'");
    expect(fish).toContain("__kb_path");
  });
});

describe("definition errors", () => {
  it("refuses an option a group above already declares, and an alias of no command", () => {
    expect(() =>
      defineCommands({
        name: "x",
        command: "x",
        summary: "X.",
        options: { project: { type: "string", description: "P." } },
        commands: (top) => ({
          add: top.command({
            summary: "Add.",
            options: { project: { type: "string", description: "Again." } },
            run: () => undefined
          })
        })
      })
    ).toThrow("x add: --project is declared by a group above it too");
    expect(() =>
      defineCommands({
        name: "x",
        command: "x",
        summary: "X.",
        aliases: { old: "missing" },
        commands: (top) => ({ add: top.command({ summary: "Add.", run: () => undefined }) })
      })
    ).toThrow("x: the alias old names no command missing");
  });
});

describe("inherited settings", () => {
  it("tells the group's onFailure of a command's unexpected failure, and leaves the header off when the group does", async () => {
    const failures: unknown[] = [];
    const quiet = defineCommands({
      name: "q",
      command: "q",
      summary: "Q.",
      header: false,
      onFailure: (error: unknown): void => {
        failures.push(error);
      },
      commands: (top) => ({
        boom: top.command({
          summary: "Fail.",
          run: (): void => {
            throw new Error("boom");
          }
        })
      })
    });
    const run = await runScript(quiet, ["boom"]);
    expect(run.exitCode).toBe(EXIT.failure);
    expect(run.stderr).not.toContain("Q.");
    expect(failures).toHaveLength(1);
  });
});
