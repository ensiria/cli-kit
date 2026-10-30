/**
 * Tests for `defineScript`: parsing, validation, help, version, json, env options, failures and cleanups.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { EXIT } from "../src/constants.ts";
import { defineScript, ScriptError, usageError } from "../src/script.ts";
import { createTestIo, runScript } from "../src/testing.ts";

const greet = defineScript({
  name: "greet",
  command: "node greet.ts",
  summary: "Say hello.",
  version: "1.0.0",
  json: true,
  options: {
    loud: { type: "boolean", short: "l", description: "Shout.", env: "GREET_LOUD" },
    lang: { type: "string", description: "Language.", choices: ["en", "it"], default: "en" },
    token: { type: "string", description: "Token.", env: "GREET_TOKEN" },
    tag: { type: "string", description: "Tags.", multiple: true, env: "GREET_TAGS" }
  },
  positionals: [
    { name: "name", description: "Who.", required: true },
    { name: "others", description: "Who else.", variadic: true }
  ],
  run: ({ options, args, log }) => {
    const words = options.lang === "it" ? "ciao" : "hello";
    const text = `${words} ${[args.name, ...args.others].join(", ")}`;
    log.success(options.loud ? text.toUpperCase() : text);
    return { text, token: options.token ?? null, tags: options.tag };
  }
});

describe("parsing", () => {
  it("prints the header and runs with typed options and arguments", async () => {
    const run = await runScript(greet, ["Ada", "Bob", "--lang", "it", "-l"]);
    expect(run.exitCode).toBe(EXIT.ok);
    expect(run.stdout).toBe("✓ CIAO ADA, BOB\n");
    expect(run.stderr).toBe("▸ greet 1.0.0 Say hello.\n");
  });

  it("applies defaults", async () => {
    const run = await runScript(greet, ["Ada"]);
    expect(run.stdout).toContain("✓ hello Ada");
  });

  it("sets the process exit code through the io", async () => {
    const test = createTestIo();
    await greet.run(["Ada"], { io: test.io });
    expect(test.exitCode()).toBe(EXIT.ok);
  });

  it("reads io.argv when no arguments are passed", async () => {
    const test = createTestIo({ argv: ["Zoe"] });
    await greet.run(undefined, { io: test.io });
    expect(test.stdout()).toContain("hello Zoe");
  });
});

describe("usage errors", () => {
  it.each([
    [["Ada", "--nope"], /Unknown option '--nope'/],
    [[], /missing argument <name>/],
    [["Ada", "--lang", "fr"], /--lang must be one of en, it \(got "fr"\)/],
    [["Ada", "--token"], /--token <value>' argument missing/]
  ])("%j exits with 2 and points to --help", async (argv, message) => {
    const run = await runScript(greet, argv);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toMatch(message);
    expect(run.stderr).toContain("Run node greet.ts --help for the options.");
  });

  it("rejects extra arguments when nothing is variadic", async () => {
    const script = defineScript({ name: "s", command: "s", summary: "S.", run: () => undefined });
    const run = await runScript(script, ["extra"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("unexpected argument: extra");
    const one = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      positionals: [{ name: "a", description: "A." }],
      run: () => undefined
    });
    expect((await runScript(one, ["x", "y"])).stderr).toContain("too many arguments: y");
  });

  it("validates a positional's choices", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      positionals: [{ name: "mode", description: "Mode.", required: true, choices: ["on", "off"] }],
      run: ({ args }) => {
        const mode: "on" | "off" = args.mode;
        return mode;
      }
    });
    expect((await runScript(script, ["maybe"])).stderr).toContain(
      '<mode> must be one of on, off (got "maybe")'
    );
    expect((await runScript(script, ["on"])).exitCode).toBe(EXIT.ok);
  });
});

describe("help and version", () => {
  it("prints the help and exits 0 without running", async () => {
    const run = await runScript(greet, ["--help"]);
    expect(run.exitCode).toBe(EXIT.ok);
    expect(run.stdout).toContain("greet 1.0.0 — Say hello.");
    expect(run.stdout).toContain("-V, --version");
    expect(run.stdout).toContain("--json");
    expect(run.stdout).not.toContain("✓");
  });

  it("prints the version alone", async () => {
    const run = await runScript(greet, ["--version"]);
    expect(run.stdout).toBe("1.0.0\n");
    expect((await runScript(greet, ["-V"])).stdout).toBe("1.0.0\n");
  });

  it("has no --version or --json unless the definition asks", async () => {
    const script = defineScript({ name: "s", command: "s", summary: "S.", run: () => undefined });
    expect(script.help()).not.toContain("--version");
    expect(script.help()).not.toContain("--json");
    expect((await runScript(script, ["--version"])).exitCode).toBe(EXIT.usage);
  });

  it("exposes the help, Markdown and usage data", () => {
    expect(greet.help()).toContain("Usage");
    expect(greet.markdown()).toContain("### `greet`");
    expect(Object.keys(greet.source.options)).toEqual([
      "loud",
      "lang",
      "token",
      "tag",
      "json",
      "version",
      "help",
      "quiet",
      "verbose",
      "no-color"
    ]);
  });
});

describe("required options and optional values", () => {
  const deploy = defineScript({
    name: "deploy",
    command: "deploy",
    summary: "Deploy.",
    json: true,
    options: {
      token: { type: "string", description: "Token.", required: true, env: "DEPLOY_TOKEN" },
      color: {
        type: "string",
        short: "c",
        description: "When to colour.",
        value: "optional",
        impliedValue: "auto",
        choices: ["auto", "always", "never"]
      },
      watch: { type: "string", description: "Folder to watch.", value: "optional" }
    },
    positionals: [{ name: "target", description: "Where." }],
    run: ({ options, args }) => {
      const token: string = options.token;
      return {
        token,
        color: options.color ?? null,
        watch: options.watch ?? null,
        target: args.target ?? null
      };
    }
  });

  it("fails with a usage error when a required option is missing, naming its variable", async () => {
    const run = await runScript(deploy, []);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("missing option --token (or DEPLOY_TOKEN)");
  });

  it("accepts a required option from the command line or its variable", async () => {
    expect(JSON.parse((await runScript(deploy, ["--json", "--token", "t"])).stdout)).toMatchObject({
      token: "t"
    });
    const fromEnv = await runScript(deploy, ["--json"], { env: { DEPLOY_TOKEN: "e" } });
    expect(JSON.parse(fromEnv.stdout)).toMatchObject({ token: "e" });
  });

  it("gives an option with an optional value its implied value when alone, its own after =", async () => {
    const parse = async (argv: string[]): Promise<unknown> =>
      JSON.parse((await runScript(deploy, ["--json", "--token", "t", ...argv])).stdout);
    expect(await parse([])).toMatchObject({ color: null, watch: null });
    expect(await parse(["--color"])).toMatchObject({ color: "auto" });
    expect(await parse(["-c"])).toMatchObject({ color: "auto" });
    expect(await parse(["--color=never"])).toMatchObject({ color: "never" });
    expect(await parse(["-cnever"])).toMatchObject({ color: "never" });
    expect(await parse(["--watch"])).toMatchObject({ watch: "" });
    expect(await parse(["--color", "prod"])).toMatchObject({ color: "auto", target: "prod" });
    expect(await parse(["--", "--color"])).toMatchObject({ color: null, target: "--color" });
  });

  it("still validates the choices of an optional value", async () => {
    const run = await runScript(deploy, ["--token", "t", "--color=pink"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain('--color must be one of auto, always, never (got "pink")');
  });

  it("shows both in the help", () => {
    const help = deploy.help();
    expect(help).toContain("--token <value>");
    expect(help).toContain("(required; env: DEPLOY_TOKEN)");
    expect(help).toContain("-c, --color[=<value>]");
    expect(help).toContain("alone: auto");
  });

  it("rejects a boolean with a value or required, and an impliedValue without an optional value", () => {
    const base = { name: "s", command: "s", summary: "S.", run: (): undefined => undefined };
    expect(() =>
      defineScript({ ...base, options: { dry: { type: "boolean", description: "x", required: true } } })
    ).toThrow("--dry is a boolean");
    expect(() =>
      defineScript({ ...base, options: { a: { type: "string", description: "x", impliedValue: "y" } } })
    ).toThrow("--a has an impliedValue but its value is not optional");
  });

  it("leaves rules between options to the script, as usage errors", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      options: {
        from: { type: "string", description: "Start." },
        to: { type: "string", description: "End." }
      },
      run: ({ options }) => {
        if (options.to && !options.from) throw usageError("--to needs --from");
      }
    });
    const run = await runScript(script, ["--to", "b"]);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toBe("▸ s S.\n✗ --to needs --from\n  Run s --help for the options.\n");
  });
});

describe("--yes", () => {
  it("exists only for scripts that ask questions, and reaches the context", async () => {
    const asking = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      prompts: true,
      json: true,
      run: ({ isYes }) => ({ isYes })
    });
    expect(asking.help()).toContain("-y, --yes");
    expect(JSON.parse((await runScript(asking, ["-y", "--json"])).stdout)).toEqual({ isYes: true });
    expect(JSON.parse((await runScript(asking, ["--json"])).stdout)).toEqual({ isYes: false });
    const silent = defineScript({ name: "s", command: "s", summary: "S.", run: () => undefined });
    expect(silent.help()).not.toContain("--yes");
  });
});

describe("CLI_KIT_DESCRIBE", () => {
  it("prints the JSON description and does not run", async () => {
    let ran = false;
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: () => {
        ran = true;
      }
    });
    const run = await runScript(script, ["--nonsense"], { env: { CLI_KIT_DESCRIBE: "1" } });
    expect(run.exitCode).toBe(EXIT.ok);
    expect(JSON.parse(run.stdout)).toMatchObject({ schema: 1, name: "s", summary: "S." });
    expect(ran).toBe(false);
  });
});

describe("--json", () => {
  it("prints the result alone on stdout and the logs on stderr", async () => {
    const run = await runScript(greet, ["Ada", "--json", "--tag", "a", "--tag", "b"]);
    expect(JSON.parse(run.stdout)).toEqual({ text: "hello Ada", token: null, tags: ["a", "b"] });
    expect(run.stderr).toBe("✓ hello Ada\n");
  });
});

describe("environment options", () => {
  it("reads an option from its variable when not on the command line", async () => {
    const run = await runScript(greet, ["Ada", "--json"], {
      env: { GREET_TOKEN: "secret", GREET_TAGS: "a, b,,c", GREET_LOUD: "yes" }
    });
    expect(JSON.parse(run.stdout)).toEqual({ text: "hello Ada", token: "secret", tags: ["a", "b", "c"] });
    expect(run.stderr).toBe("✓ HELLO ADA\n");
  });

  it("prefers the command line", async () => {
    const run = await runScript(greet, ["Ada", "--json", "--token", "flag"], { env: { GREET_TOKEN: "env" } });
    expect(JSON.parse(run.stdout)).toMatchObject({ token: "flag" });
  });

  it("rejects a boolean variable that is not yes or no", async () => {
    const run = await runScript(greet, ["Ada"], { env: { GREET_LOUD: "maybe" } });
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("GREET_LOUD=maybe is not a yes/no value for --loud");
  });
});

describe("common options", () => {
  it("prints the header on stderr, so piped stdout holds only results", async () => {
    const run = await runScript(greet, ["Ada"]);
    expect(run.stderr).toBe("▸ greet 1.0.0 Say hello.\n");
    expect(run.stdout).not.toContain("greet");
  });

  it("--quiet hides the header and results, keeps errors", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: ({ log }) => {
        log.success("done");
        log.warn("careful");
      }
    });
    const run = await runScript(script, ["-q"]);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("! careful\n");
  });

  it("colours a terminal unless --no-color or NO_COLOR", async () => {
    expect((await runScript(greet, ["Ada"], { tty: true })).rawStdout).toContain("\u001B[");
    expect((await runScript(greet, ["Ada", "--no-color"], { tty: true })).rawStdout).not.toContain("\u001B[");
    expect((await runScript(greet, ["Ada"], { tty: true, env: { NO_COLOR: "1" } })).rawStdout).not.toContain(
      "\u001B["
    );
  });

  it("uses ASCII glyphs with CLI_KIT_ASCII=1", async () => {
    const run = await runScript(greet, ["Ada"], { env: { CLI_KIT_ASCII: "1" } });
    expect(run.stdout).toBe("+ hello Ada\n");
    expect(run.stderr).toBe("> greet 1.0.0 Say hello.\n");
  });
});

describe("failures", () => {
  it("prints a ScriptError with its hint and exit code", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: () => {
        throw new ScriptError("not in order", { hint: "Run s", exitCode: 3 });
      }
    });
    const run = await runScript(script);
    expect(run.exitCode).toBe(3);
    expect(run.stderr).toBe("▸ s S.\n✗ not in order\n  Run s\n");
  });

  it("exits silently with the code of a problem the script already printed", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      header: false,
      run: ({ log }) => {
        log.error("CDP: target closed");
        throw new ScriptError("ffmpeg failed", { exitCode: 5, isReported: true });
      }
    });
    const run = await runScript(script);
    expect(run.exitCode).toBe(5);
    expect(run.stderr).toBe("✗ CDP: target closed\n");
  });

  it("treats usageError as exit 2", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: () => {
        throw usageError("--from must be before --to");
      }
    });
    const run = await runScript(script);
    expect(run.exitCode).toBe(EXIT.usage);
    expect(run.stderr).toContain("Run s --help for the options.");
  });

  it("prints any other error as a failure, its stack only with --verbose", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: async () => {
        throw new Error("disk full");
      }
    });
    const run = await runScript(script);
    expect(run.exitCode).toBe(EXIT.failure);
    expect(run.stderr).toBe("▸ s S.\n✗ disk full\n");
    expect((await runScript(script, ["-v"])).stdout).toContain("Error: disk full");
  });

  it("tells onFailure of an unexpected failure only, and a throwing onFailure changes nothing", async () => {
    const told: unknown[] = [];
    const failing = (error: unknown) =>
      defineScript({
        name: "s",
        command: "s",
        summary: "S.",
        onFailure: (failure: unknown): void => {
          told.push(failure);
          throw new Error("the report failed too");
        },
        run: async () => {
          throw error;
        }
      });
    const bug = new Error("disk full");
    const bugRun = await runScript(failing(bug));
    expect(told).toEqual([bug]);
    expect(bugRun.exitCode).toBe(EXIT.failure);
    expect(bugRun.stderr).toBe("▸ s S.\n✗ disk full\n");
    await runScript(failing(new ScriptError("not in order", { exitCode: 3 })));
    expect(told, "an expected failure is not a bug").toEqual([bug]);
  });
});

describe("definition mistakes", () => {
  it("rejects a clash with a common option or a shared short alias", () => {
    const base = { command: "s", summary: "S.", run: (): undefined => undefined };
    expect(() =>
      defineScript({ ...base, name: "s", options: { quiet: { type: "boolean", description: "x" } } })
    ).toThrow("--quiet is a common option");
    expect(() =>
      defineScript({
        ...base,
        name: "s",
        options: { hard: { type: "boolean", short: "h", description: "x" } }
      })
    ).toThrow("-h is used by both --hard and --help");
  });

  it("rejects positionals out of order", () => {
    const base = { name: "s", command: "s", summary: "S.", run: (): undefined => undefined };
    expect(() =>
      defineScript({
        ...base,
        positionals: [
          { name: "a", description: "A." },
          { name: "b", description: "B.", required: true }
        ]
      })
    ).toThrow("required <b> comes after an optional argument");
    expect(() =>
      defineScript({
        ...base,
        positionals: [
          { name: "a", description: "A.", variadic: true },
          { name: "b", description: "B." }
        ]
      })
    ).toThrow("variadic <a> must be the last argument");
  });
});

describe("scripts run by programs", () => {
  it("print no header with header: false", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      header: false,
      run: ({ io }) => {
        io.stdout.write('{"ok":true}');
      }
    });
    const run = await runScript(script);
    expect(run.stdout).toBe('{"ok":true}');
    expect(run.stderr).toBe("");
  });

  it("stop gracefully on the first Ctrl+C with onInterrupt, and at once on the second", async () => {
    const graceful = createTestIo();
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: ({ onInterrupt }) =>
        new Promise<void>((resolve) => {
          onInterrupt(() => setTimeout(resolve, 5));
          graceful.signal("SIGINT");
        })
    });
    expect(await script.run([], { io: graceful.io })).toBe(EXIT.ok);
    expect(graceful.exitedWith()).toBeUndefined();

    const forced = createTestIo();
    const stuck = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: ({ onInterrupt }) =>
        new Promise<void>(() => {
          onInterrupt(() => undefined);
          forced.signal("SIGINT");
          forced.signal("SIGINT");
        })
    });
    expect(await stuck.run([], { io: forced.io })).toBe(EXIT.interrupted);
    expect(forced.exitedWith()).toBe(EXIT.interrupted);
  });
});

describe("cleanups", () => {
  it("run after success and after failure", async () => {
    const calls: string[] = [];
    const ok = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: ({ onExit }) => {
        onExit(() => {
          calls.push("ok");
        });
      }
    });
    const failing = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: ({ onExit }) => {
        onExit(() => {
          calls.push("failed");
        });
        throw new Error("x");
      }
    });
    await runScript(ok);
    await runScript(failing);
    expect(calls).toEqual(["ok", "failed"]);
  });

  it("report a failing cleanup as a warning without changing the exit code", async () => {
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: ({ onExit }) => {
        onExit(() => {
          throw new Error("temp dir gone");
        });
      }
    });
    const run = await runScript(script);
    expect(run.exitCode).toBe(EXIT.ok);
    expect(run.stderr).toBe("▸ s S.\n! cleanup failed: temp dir gone\n");
  });

  it("run on Ctrl+C, which ends the run with 130", async () => {
    const calls: string[] = [];
    const test = createTestIo({ tty: true });
    const script = defineScript({
      name: "s",
      command: "s",
      summary: "S.",
      run: ({ onExit }) => {
        onExit(() => {
          calls.push("cleaned");
        });
        return new Promise<void>(() => {
          test.signal("SIGINT");
        });
      }
    });
    const code = await script.run([], { io: test.io });
    expect(code).toBe(EXIT.interrupted);
    expect(test.exitedWith()).toBe(EXIT.interrupted);
    expect(calls).toEqual(["cleaned"]);
    expect(test.stdout()).toContain("\u001B[?25h");
  });
});

describe("raw positionals", () => {
  const wrapper = defineScript({
    name: "wrap",
    command: "node wrap.ts",
    summary: "Run a command with its own arguments.",
    json: true,
    header: false,
    options: { log: { type: "string", description: "Log file." } },
    positionals: [
      { name: "command", description: "What to run.", required: true },
      { name: "args", description: "Its arguments, as they are.", raw: true }
    ],
    run: ({ options, args }) => ({ log: options.log ?? null, command: args.command, args: args.args })
  });

  it("hands every argument after the command over as it is, its options included", async () => {
    const run = await runScript(wrapper, [
      "--json",
      "--log",
      "/tmp/w.log",
      "cli.js",
      "--cdp-endpoint",
      "http://x",
      "--output-dir",
      "/tmp/out",
      "-v",
      "--json"
    ]);
    expect(run.exitCode).toBe(EXIT.ok);
    expect(JSON.parse(run.stdout)).toEqual({
      log: "/tmp/w.log",
      command: "cli.js",
      args: ["--cdp-endpoint", "http://x", "--output-dir", "/tmp/out", "-v", "--json"]
    });
  });

  it("keeps its own options before the raw part: --help still answers", async () => {
    const run = await runScript(wrapper, ["--help"]);
    expect(run.exitCode).toBe(EXIT.ok);
    expect(run.stdout).toContain("<command> [args...]");
  });

  it("takes none, and still wants the arguments before it", async () => {
    expect(JSON.parse((await runScript(wrapper, ["--json", "cli.js"])).stdout).args).toEqual([]);
    expect((await runScript(wrapper, [])).exitCode).toBe(EXIT.usage);
  });

  it("must be the last positional", () => {
    expect(() =>
      defineScript({
        name: "bad",
        command: "bad",
        summary: "Bad.",
        positionals: [
          { name: "a", description: "A.", raw: true },
          { name: "b", description: "B." }
        ],
        run: () => undefined
      })
    ).toThrow("raw <a> must be the last argument");
  });
});
