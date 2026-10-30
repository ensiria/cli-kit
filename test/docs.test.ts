/**
 * Tests for the man page, the JSON description and the shell completions.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { formatCompletion, formatHelpJson, formatHelpMan } from "../src/docs.ts";
import type { HelpSource } from "../src/help.types.ts";

const SOURCE: HelpSource = {
  name: "deploy",
  command: "deploy",
  summary: "Deploy a build.",
  description: "Uploads, then switches.",
  version: "1.0.0",
  options: {
    target: { type: "string", short: "t", description: "Where to.", choices: ["dev", "prod"] },
    color: { type: "string", description: "Colour.", value: "optional", impliedValue: "auto" },
    token: { type: "string", description: "It's the token.", required: true, env: "TOKEN" },
    dry: { type: "boolean", short: "n", description: "Change nothing." }
  },
  positionals: [{ name: "mode", description: "Mode.", required: true, choices: ["fast", "safe"] }],
  examples: [{ command: "deploy -t prod fast", description: "Ship it." }]
};

describe("formatHelpJson", () => {
  it("describes every field, absent ones as null", () => {
    const json = formatHelpJson(SOURCE);
    expect(json).toMatchObject({
      schema: 1,
      name: "deploy",
      version: "1.0.0",
      description: "Uploads, then switches."
    });
    expect(json.options[0]).toEqual({
      name: "target",
      type: "string",
      description: "Where to.",
      short: "t",
      valueName: "value",
      multiple: false,
      default: null,
      choices: ["dev", "prod"],
      env: null,
      required: false,
      value: "required",
      impliedValue: null
    });
    expect(json.options[1]).toMatchObject({ value: "optional", impliedValue: "auto" });
    expect(json.options[3]).toMatchObject({ type: "boolean", valueName: null, value: null });
    expect(json.positionals).toEqual([
      { name: "mode", description: "Mode.", required: true, variadic: false, choices: ["fast", "safe"] }
    ]);
  });
});

describe("formatHelpMan", () => {
  it("writes the roff sections, dashes escaped", () => {
    const man = formatHelpMan(SOURCE);
    expect(man.startsWith('.TH "DEPLOY" "1" "" "1.0.0" "Deploy a build."\n')).toBe(true);
    expect(man).toContain(".SH NAME\ndeploy \\- Deploy a build.\n");
    expect(man).toContain(".SH SYNOPSIS\ndeploy [options] <mode>\n");
    expect(man).toContain(".TP\n.B \\-t, \\-\\-target <value>\nWhere to. (one of: dev, prod)\n");
    expect(man).toContain(".B \\-\\-color[=<value>]");
    expect(man).toContain(".SH EXAMPLES\n.TP\n.B deploy \\-t prod fast\nShip it.\n");
  });
});

describe("formatCompletion", () => {
  it("bash: option words, choices after an option and for positionals", () => {
    const bash = formatCompletion(SOURCE, "bash");
    expect(bash).toContain("_deploy() {");
    expect(bash).toContain("--target|-t) COMPREPLY=($(compgen -W 'dev prod' -- \"$cur\")); return ;;");
    expect(bash).toContain("compgen -W '--target -t --color --token --dry -n fast safe'");
    expect(bash).toContain("complete -F _deploy deploy");
  });

  it("zsh: _arguments specs with exclusions, values and positionals", () => {
    const zsh = formatCompletion(SOURCE, "zsh", "dp");
    expect(zsh.startsWith("#compdef dp\n")).toBe(true);
    expect(zsh).toContain("'(-t --target)'{-t,--target}'[Where to.]:value:(dev prod)'");
    expect(zsh).toContain("--color=-'[Colour.]:value:_files'");
    expect(zsh).toContain("--token'[It'\\''s the token.]:value:_files'");
    expect(zsh).toContain("'1:mode:(fast safe)'");
  });

  it("fish: one complete line per option", () => {
    const fish = formatCompletion(SOURCE, "fish");
    expect(fish).toContain("complete -c deploy -l target -s t -x -a 'dev prod' -d 'Where to.'");
    expect(fish).toContain("complete -c deploy -l dry -s n -d 'Change nothing.'");
    expect(fish).toContain("complete -c deploy -l token -r -d 'It'\\''s the token.'");
    expect(fish).toContain("complete -c deploy -f -a 'fast safe' -d 'Mode.'");
  });
});
