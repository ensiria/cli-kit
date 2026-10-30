/**
 * Tests for the Markdown helpers.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  codeSpan,
  escapeMarkdown,
  escapeTableCell,
  findTable,
  formatTable,
  formatTableRow,
  markdownText,
  readSection,
  replaceSection,
  splitTableRow
} from "../src/markdown.ts";

const DOC = [
  "# Title",
  "",
  "## Table",
  "",
  "| # | Name | Note |",
  "|---|:---:|---|",
  "| 1 | a | x \\| y |",
  "| 2 | b |  |",
  "",
  "after",
  "",
  "### Notes",
  "",
  "- one",
  "",
  "## Counts",
  "",
  "old",
  "",
  "## End",
  ""
].join("\n");

describe("escaping", () => {
  it("escapes HTML-like text, and pipes in cells", () => {
    expect(escapeMarkdown("a <b> c")).toBe("a \\<b\\> c");
    expect(escapeTableCell("a | <b>")).toBe("a \\| \\<b\\>");
  });
});

describe("table rows", () => {
  it("splits and trims cells, keeping escaped pipes inside", () => {
    expect(splitTableRow("| 1 | a | x \\| y |")).toEqual(["1", "a", "x \\| y"]);
    expect(splitTableRow("| 2 | b |  |")).toEqual(["2", "b", ""]);
  });

  it("formats a row", () => {
    expect(formatTableRow(["1", "a"])).toBe("| 1 | a |");
    expect(formatTableRow(["todo", ""])).toBe("| todo | |");
  });
});

describe("findTable", () => {
  it("finds a table by its header, with line positions", () => {
    const table = findTable(DOC, (header) => header[0] === "#");
    expect(table?.header).toEqual(["#", "Name", "Note"]);
    expect(table?.rows).toEqual([
      ["1", "a", "x \\| y"],
      ["2", "b", ""]
    ]);
    expect(DOC.split("\n")[table?.firstRow ?? 0]).toBe("| 1 | a | x \\| y |");
    expect(DOC.split("\n")[table?.end ?? 0]).toBe("");
  });

  it("returns undefined when no header matches", () => {
    expect(findTable(DOC, (header) => header[0] === "Nope")).toBeUndefined();
    expect(findTable("no tables", () => true)).toBeUndefined();
  });
});

describe("sections", () => {
  it("reads a body up to the next heading of the same level or higher", () => {
    expect(readSection(DOC, "### Notes")).toBe("\n- one\n");
    expect(readSection(DOC, "## Table")).toContain("### Notes");
    expect(readSection(DOC, "## Missing")).toBeUndefined();
  });

  it("replaces a body, keeping the heading and what follows", () => {
    const next = replaceSection(DOC, "## Counts", "new\n");
    expect(next).toContain("## Counts\n\nnew\n\n## End");
    expect(() => replaceSection(DOC, "## Missing", "x")).toThrow('section "## Missing" not found');
  });

  it("finds a heading on the first line", () => {
    expect(readSection("## A\n\nbody\n", "## A")).toBe("\nbody\n");
  });
});

describe("formatTable", () => {
  const columns = [
    { key: "name", title: "Name" },
    { key: "count", title: "Count", align: "right" },
    { key: "state", title: "State", align: "center" }
  ] as const;
  const rows = [
    { name: "Ada", count: 3, state: "ok" },
    { name: "Bob | Eve", count: 12, state: "" }
  ];

  it("writes a compact table by default: titles, the alignments, a line per row, plain text escaped", () => {
    expect(formatTable(columns, rows)).toBe(
      ["| Name | Count | State |", "|---|---:|:---:|", "| Ada | 3 | ok |", "| Bob \\| Eve | 12 | |"].join(
        "\n"
      )
    );
  });

  it("pads every column to its widest cell when asked, the colons at the cells' edges", () => {
    expect(formatTable(columns, rows, { isPadded: true })).toBe(
      [
        "| Name       | Count | State |",
        "|------------|------:|:-----:|",
        "| Ada        |     3 |  ok   |",
        "| Bob \\| Eve |    12 |       |"
      ].join("\n")
    );
  });

  it("puts Markdown cells as they are, only their | escaped, and reads back with findTable", () => {
    const table = formatTable(
      [
        { key: "option", title: "Option" },
        { key: "does", title: "What it does" }
      ],
      [
        { option: codeSpan("--format <a|b>"), does: "Pick a format." },
        { option: markdownText("[docs](https://example.com)"), does: "<see>" }
      ]
    );
    expect(table).toBe(
      [
        "| Option | What it does |",
        "|---|---|",
        "| `--format <a\\|b>` | Pick a format. |",
        "| [docs](https://example.com) | \\<see\\> |"
      ].join("\n")
    );
    expect(findTable(table, (header) => header[0] === "Option")?.rows[0]).toEqual([
      "`--format <a\\|b>`",
      "Pick a format."
    ]);
  });
});

describe("codeSpan", () => {
  it("fences the code with more backticks than it holds, spaced when it starts or ends with one", () => {
    expect(codeSpan("--json").markdown).toBe("`--json`");
    expect(codeSpan("a `b` c").markdown).toBe("``a `b` c``");
    expect(codeSpan("`tick").markdown).toBe("`` `tick ``");
  });
});
