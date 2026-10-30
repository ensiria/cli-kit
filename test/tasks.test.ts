/**
 * Tests for the task list, on a terminal and in a pipe.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { createLogger } from "../src/log.ts";
import { ScriptError } from "../src/script.ts";
import { tasks } from "../src/tasks.ts";
import { createTestIo } from "../src/testing.ts";
import { stripAnsi } from "../src/text.ts";

const setup = (tty: boolean) => {
  const test = createTestIo({ tty });
  const log = createLogger({ stdout: test.io.stdout, stderr: test.io.stderr });
  return { test, target: { io: test.io, log } };
};

/** Replaces durations, which depend on the machine. */
const noTimes = (text: string): string => text.replace(/\d+(\.\d+)? (ms|s)/g, "<t>");

describe("tasks in a pipe", () => {
  it("prints each task's start and end, nested, with skips", async () => {
    const { test, target } = setup(false);
    const results = await tasks(
      [
        { title: "Tokens", run: () => undefined },
        { title: "Docs", skip: () => "no changes" },
        {
          title: "Icons",
          children: [
            { title: "Optimise", run: (task) => task.setTitle("Optimised 3") },
            { title: "Generate", run: async () => undefined }
          ]
        }
      ],
      target
    );
    expect(noTimes(test.stdout())).toBe(
      [
        "→ Tokens",
        "✓ Tokens <t>",
        "– Docs skipped: no changes",
        "→ Icons",
        "  → Optimise",
        "  ✓ Optimised 3 <t>",
        "  → Generate",
        "  ✓ Generate <t>",
        "✓ Icons <t>",
        ""
      ].join("\n")
    );
    expect(results.map((result) => result.status)).toEqual(["done", "skipped", "done"]);
    expect(results[2]?.children.map((child) => child.title)).toEqual(["Optimised 3", "Generate"]);
  });

  it("stops at a failure and throws a ScriptError naming the task", async () => {
    const { test, target } = setup(false);
    const ran: string[] = [];
    const run = tasks(
      [
        { title: "Lint", run: () => void ran.push("lint") },
        {
          title: "Build",
          children: [
            {
              title: "Compile",
              run: () => {
                throw new Error("syntax error");
              }
            }
          ]
        },
        { title: "Test", run: () => void ran.push("test") }
      ],
      target
    );
    await expect(run).rejects.toThrow(new ScriptError("Compile failed: syntax error"));
    expect(ran).toEqual(["lint"]);
    expect(noTimes(test.stderr())).toBe("✗ Compile <t>\n✗ Build <t>\n");
  });

  it("goes on after a failure when asked, and returns the results", async () => {
    const { target } = setup(false);
    const results = await tasks(
      [
        {
          title: "A",
          run: () => {
            throw new Error("x");
          }
        },
        { title: "B", run: () => undefined }
      ],
      target,
      { continueOnError: true }
    );
    expect(results.map((result) => result.status)).toEqual(["failed", "done"]);
    expect(results[0]?.error).toBeInstanceOf(Error);
  });

  it("runs top-level tasks concurrently up to the limit", async () => {
    const { target } = setup(false);
    let running = 0;
    let peak = 0;
    const work = async (): Promise<void> => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    };
    await tasks(
      Array.from({ length: 6 }, (_, index) => ({ title: `T${index}`, run: work })),
      target,
      { concurrency: 3 }
    );
    expect(peak).toBe(3);
  });
});

describe("tasks on a terminal", () => {
  it("redraws the list on stderr, then prints its final state once", async () => {
    const { test, target } = setup(true);
    await tasks(
      [
        { title: "Tokens", run: (task) => task.setDetail("colors.json") },
        { title: "Docs", skip: () => true }
      ],
      target
    );
    const frames = stripAnsi(test.stderr());
    expect(frames).toContain("○ Tokens");
    expect(frames).toContain("Tokens colors.json");
    expect(test.stderr().endsWith("\u001B[?25h")).toBe(true);
    expect(noTimes(stripAnsi(test.stdout()))).toBe("✓ Tokens <t>\n– Docs skipped\n");
  });
});
