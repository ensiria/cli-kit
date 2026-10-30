/**
 * The kit's gallery: prints every helper, so a change to the look is seen at once in a real terminal, in a pipe
 * (`| cat`), without colour (`--no-color`) and in ASCII (`CLI_KIT_ASCII=1`).
 *
 * @remarks
 * Every helper of the kit has an entry here; a new helper adds one. The sections are listed by
 * `node packages/cli-kit/examples/gallery.ts --help`.
 *
 * @module
 */
import { GLYPHS, TONES } from "../src/constants.ts";
import { formatBytes, formatCount, formatDuration, formatRelativeTime, plural } from "../src/format.ts";
import { glyph } from "../src/glyphs.ts";
import type { GlyphName } from "../src/glyphs.types.ts";
import { header } from "../src/header.ts";
import { box, columns, keyValue, list, table, tree } from "../src/layout.ts";
import type { Logger } from "../src/log.types.ts";
import { escapeTableCell, findTable, formatTableRow, replaceSection } from "../src/markdown.ts";
import { progress } from "../src/progress.ts";
import { confirm, multiselect, select, text } from "../src/prompts.ts";
import { defineScript } from "../src/script.ts";
import type { ScriptContext } from "../src/script.types.ts";
import { spinner } from "../src/spinner.ts";
import { paint } from "../src/style.ts";
import type { Tone } from "../src/style.types.ts";
import { tasks } from "../src/tasks.ts";
import { indent, link, middleTruncate, supportsLinks, truncate, wrap } from "../src/text.ts";
import { timer } from "../src/timer.ts";

/** The run context the sections receive. */
type GalleryContext = ScriptContext<Record<never, never>, readonly []>;

/** One section of the gallery: a title and what it prints. */
interface GallerySection {
  /** Shown as the section's heading. */
  readonly title: string;
  /** Prints the section. */
  readonly print: (log: Logger, context: GalleryContext) => void | Promise<void>;
  /** Left out of a run without section names (it waits for answers). */
  readonly isOnDemand?: boolean | undefined;
}

/** Waits, so the live helpers have time to move. */
const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/** A fixed moment, so relative times read the same every run. */
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0);

/** The sections, in the order they print. */
const SECTIONS: Readonly<Record<string, GallerySection>> = {
  lines: {
    title: "Log lines",
    print: (log) => {
      log.step("step: the script starts a step");
      log.info("info: a neutral fact");
      log.success("success: something finished well");
      log.warn("warn: something to look at (stderr)");
      log.error("error: something failed (stderr)");
      log.hint("hint: what to do about it (stderr)");
      log.debug("debug: shown with --verbose");
      log.plain("plain: no glyph");
    }
  },
  tones: {
    title: "Tones",
    print: (log) => {
      const tones = Object.keys(TONES).filter((tone): tone is Tone => tone in TONES);
      log.plain(tones.map((tone) => paint(tone, tone, log.style.color)).join("  "));
    }
  },
  glyphs: {
    title: "Glyphs",
    print: (log) => {
      const names = Object.keys(GLYPHS).filter((name): name is GlyphName => name in GLYPHS);
      log.plain(
        columns(
          names.map((name) => `${glyph(name, log.style.unicode)} ${name}`),
          log.style
        )
      );
    }
  },
  header: {
    title: "Headers",
    print: (log) => {
      log.plain(
        header({ name: "build-order", summary: "Recompute the build order", icon: "build" }, log.style)
      );
      log.plain(
        header({ name: "check-tokens", summary: "Check contrast", icon: "check", tone: "success" }, log.style)
      );
      log.plain(header({ name: "cli-kit", summary: "Docs", icon: "docs", version: "0.1.0" }, log.style));
    }
  },
  table: {
    title: "table()",
    print: (log) => {
      const rows = [
        ["build-order", "done", 305, "packages/design-system/tools/build-order/build-order.mts"],
        ["run", "exception", 1, "e2e/run.ts"],
        ["thumb", "todo", 2, "apps/server/scripts/thumb.js"]
      ];
      const tableColumns = [
        { header: "Script", tone: "strong" as const },
        { header: "Status" },
        { header: "Steps" },
        { header: "Path", truncate: "middle" as const }
      ];
      log.plain(table(rows, { columns: tableColumns }, log.style));
      log.plain("");
      log.plain(table(rows, { columns: tableColumns, border: true }, { ...log.style, width: 60 }));
    }
  },
  keyValue: {
    title: "keyValue()",
    print: (log) => {
      log.plain(
        keyValue(
          [
            ["Rows", 305],
            ["Waves", 13],
            ["File", "packages/design-system/BUILD-ORDER.md"]
          ],
          log.style
        )
      );
    }
  },
  list: {
    title: "list() and tree()",
    print: (log) => {
      log.plain(list(["Tokens", { text: "Components", children: ["Button", "Dialog"] }, "Hooks"], log.style));
      log.plain(list(["Install", "Build", "Test"], log.style, { ordered: true }));
      log.plain(
        tree(
          {
            label: "packages/cli-kit",
            children: [
              { label: "src", children: [{ label: "script.ts" }, { label: "layout.ts" }] },
              { label: "test" },
              { label: "README.md" }
            ]
          },
          log.style
        )
      );
    }
  },
  box: {
    title: "box()",
    print: (log) => {
      log.plain(box("3 files changed\nRun pnpm test next", log.style, { title: "Done", tone: "success" }));
    }
  },
  columns: {
    title: "columns()",
    print: (log) => {
      log.plain(
        columns(["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"], log.style)
      );
    }
  },
  text: {
    title: "Text: truncate, middleTruncate, wrap, indent, link",
    print: (log, { io }) => {
      const path = "packages/design-system/tools/build-order.mts";
      log.plain(`truncate        ${truncate("The quick brown fox jumps over the lazy dog", 24, log.style)}`);
      log.plain(`middleTruncate  ${middleTruncate(path, 30, log.style)}`);
      log.plain(
        indent(wrap("wrap() keeps words whole and breaks only where it must, at the width it is given.", 36))
      );
      log.plain(
        `link            ${link("the plan", "https://example.com/cli-kit", supportsLinks(io.stdout, io.env))}`
      );
    }
  },
  spinner: {
    title: "spinner() (Kaji waves)",
    print: async (_log, context) => {
      const spin = spinner("Fetching tags", context);
      await pause(1800);
      spin.update("Fetching tags: 12 of 40");
      await pause(1200);
      spin.succeed("Tags fetched");
      const failing = spinner("Uploading", context);
      await pause(900);
      failing.fail("Upload failed: 503");
    }
  },
  progress: {
    title: "progress()",
    print: async (_log, context) => {
      const bar = progress({ label: "Optimising icons", total: 40, unit: "files" }, context);
      for (let index = 0; index < 40; index += 1) {
        await pause(50);
        bar.tick();
      }
      bar.done();
      const scan = progress({ label: "Scanning" }, context);
      await pause(1500);
      scan.done("Scanned 1,204 files");
    }
  },
  tasks: {
    title: "tasks()",
    print: async (_log, context) => {
      await tasks(
        [
          { title: "Tokens", run: () => pause(600) },
          {
            title: "Icons",
            children: [
              {
                title: "Optimise",
                run: async (task) => {
                  for (const name of ["arrow.svg", "check.svg", "close.svg"]) {
                    task.setDetail(name);
                    await pause(300);
                  }
                }
              },
              { title: "Generate components", run: () => pause(500) }
            ]
          },
          { title: "Docs", skip: () => "no changes" },
          { title: "Catalogue", run: () => pause(400) }
        ],
        context
      );
    }
  },
  timer: {
    title: "timer()",
    print: async (log) => {
      const clock = timer();
      await pause(1234);
      log.success(`done in ${clock.format()}`);
    }
  },
  prompts: {
    title: "Prompts (on demand: gallery prompts; --yes or a pipe take the defaults)",
    isOnDemand: true,
    print: async (log, context) => {
      const name = await text({ message: "Project name?", default: "radar" }, context);
      const env = await select(
        {
          message: "Deploy to?",
          choices: ["dev", { value: "prod", label: "production", hint: "needs approval" }],
          default: "dev"
        },
        context
      );
      const parts = await multiselect(
        { message: "Which parts?", choices: ["server", "desktop", "mobile"], default: ["server"] },
        context
      );
      const isSure = await confirm({ message: `Deploy ${name} to ${env}?`, default: true }, context);
      log.info(`${name} → ${env}: ${parts.join(", ") || "nothing"} (${isSure ? "confirmed" : "cancelled"})`);
    }
  },
  markdown: {
    title: "Markdown: findTable, formatTableRow, escapeTableCell, replaceSection",
    print: (log) => {
      const doc = "## Rows\n\n| # | Name |\n|---|---|\n| 1 | b |\n| 2 | a |\n\n## Counts\n\nold\n";
      const table = findTable(doc, (header) => header[0] === "#");
      const rows = [...(table?.rows ?? [])].sort((x, y) => (x[1] ?? "").localeCompare(y[1] ?? ""));
      const lines = doc.split("\n");
      const reordered = [
        ...lines.slice(0, table?.firstRow),
        ...rows.map((row, index) => formatTableRow([String(index + 1), escapeTableCell(row[1] ?? "")])),
        ...lines.slice(table?.end)
      ].join("\n");
      log.plain(replaceSection(reordered, "## Counts", `${rows.length} rows\n`).trimEnd());
    }
  },
  format: {
    title: "Formatting",
    print: (log) => {
      log.plain(
        keyValue(
          [
            ["formatDuration", [850, 1234, 184_000, 7_500_000].map((ms) => formatDuration(ms)).join(" · ")],
            ["formatBytes", [512, 1234, 34_000_000].map((bytes) => formatBytes(bytes)).join(" · ")],
            ["formatCount", `${formatCount(1_234_567)} · ${formatCount(1_234_567, { compact: true })}`],
            [
              "formatRelativeTime",
              [NOW - 300_000, NOW + 172_800_000].map((t) => formatRelativeTime(t, NOW)).join(" · ")
            ],
            ["plural", `${plural(1, "file")} · ${plural(3, "file")} · ${plural(2, "child", "children")}`]
          ],
          log.style
        )
      );
    }
  }
};

await defineScript({
  name: "gallery",
  command: "node packages/cli-kit/examples/gallery.ts",
  summary: "Print every helper of @ensiria/cli-kit.",
  icon: "package",
  prompts: true,
  positionals: [
    { name: "sections", description: "Only these sections.", variadic: true, choices: Object.keys(SECTIONS) }
  ],
  examples: [
    { command: "node packages/cli-kit/examples/gallery.ts", description: "Everything." },
    { command: "node packages/cli-kit/examples/gallery.ts table box", description: "Two sections." },
    {
      command: "CLI_KIT_ASCII=1 node packages/cli-kit/examples/gallery.ts",
      description: "The ASCII fallbacks."
    }
  ],
  run: async (context) => {
    const { args, log } = context;
    const names =
      args.sections.length > 0
        ? args.sections
        : Object.keys(SECTIONS).filter((name) => !SECTIONS[name]?.isOnDemand);
    for (const name of names) {
      const section = SECTIONS[name];
      if (!section) continue;
      log.plain("");
      log.plain(paint("strong", section.title, log.style.color));
      await section.print(log, { ...context, args: {}, options: {} });
    }
  }
}).run();
