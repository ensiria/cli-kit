/**
 * Tests for the generated help: terminal text and Markdown.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  formatHelp,
  formatHelpMarkdown,
  optionFacts,
  optionLabel,
  positionalLabel,
  usageLine
} from "../src/help.ts";
import type { HelpSource } from "../src/help.types.ts";

const SOURCE: HelpSource = {
  name: "deploy",
  command: "node deploy.ts",
  summary: "Deploy a build.",
  description: "Uploads the files and switches the alias.",
  version: "1.2.0",
  options: {
    target: {
      type: "string",
      short: "t",
      valueName: "env",
      description: "Where to.",
      choices: ["dev", "prod"]
    },
    token: { type: "string", description: "API token.", env: "DEPLOY_TOKEN" },
    retries: { type: "string", description: "Attempts | max.", default: "3" },
    help: { type: "boolean", short: "h", description: "Show this help." }
  },
  positionals: [
    { name: "build", description: "The build folder.", required: true },
    { name: "files", description: "Only these files.", variadic: true }
  ],
  examples: [{ command: "node deploy.ts dist -t prod", description: "Deploy to production." }]
};

describe("labels", () => {
  it("builds option labels with or without a short alias", () => {
    expect(optionLabel("check", { type: "boolean", short: "c", description: "" })).toBe("-c, --check");
    expect(optionLabel("base", { type: "string", valueName: "ref", description: "" })).toBe(
      "    --base <ref>"
    );
    expect(optionLabel("base", { type: "string", description: "" })).toBe("    --base <value>");
  });

  it("labels optional values and lists required / implied facts", () => {
    expect(
      optionLabel("color", { type: "string", value: "optional", valueName: "when", description: "" })
    ).toBe("    --color[=<when>]");
    expect(optionFacts({ type: "string", description: "", required: true, env: "T" })).toBe(
      "(required; env: T)"
    );
    expect(optionFacts({ type: "string", description: "", value: "optional", impliedValue: "auto" })).toBe(
      "(alone: auto)"
    );
  });

  it("lists the facts an option's description leaves out", () => {
    expect(
      optionFacts({ type: "string", description: "", choices: ["a", "b"], default: "a", env: "X" })
    ).toBe("(one of: a, b; default: a; env: X)");
    expect(optionFacts({ type: "boolean", description: "" })).toBe("");
  });

  it("marks required, optional and variadic positionals", () => {
    expect(positionalLabel({ name: "file", description: "", required: true })).toBe("<file>");
    expect(positionalLabel({ name: "file", description: "" })).toBe("[file]");
    expect(positionalLabel({ name: "files", description: "", variadic: true })).toBe("[files...]");
  });

  it("writes the usage line", () => {
    expect(usageLine(SOURCE)).toBe("node deploy.ts [options] <build> [files...]");
  });
});

describe("formatHelp", () => {
  it("prints every section without colour", () => {
    expect(formatHelp(SOURCE, false)).toMatchInlineSnapshot(`
      "deploy 1.2.0 — Deploy a build.

      Uploads the files and switches the alias.

      Usage
        node deploy.ts [options] <build> [files...]

      Arguments
        build  The build folder.
        files  Only these files.

      Options
        -t, --target <env>     Where to. (one of: dev, prod)
            --token <value>    API token. (env: DEPLOY_TOKEN)
            --retries <value>  Attempts | max. (default: 3)
        -h, --help             Show this help.

      Examples
        node deploy.ts dist -t prod  Deploy to production.
      "
    `);
  });

  it("colours headings when asked", () => {
    expect(formatHelp(SOURCE, true)).toContain("\u001B[1mUsage\u001B[22m");
  });
});

describe("formatHelpMarkdown", () => {
  it("writes a section with the usage, arguments, options and examples", () => {
    const markdown = formatHelpMarkdown(SOURCE);
    expect(markdown).toContain("### `deploy`");
    expect(markdown).toContain("```\nnode deploy.ts [options] <build> [files...]\n```");
    expect(markdown).toContain("| `<build>` | The build folder. |");
    expect(markdown).toContain("| `--retries <value>` | Attempts \\| max. (default: 3) |");
    expect(markdown).toContain("- `node deploy.ts dist -t prod`: Deploy to production.");
  });
});
