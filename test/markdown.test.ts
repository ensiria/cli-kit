/**
 * Tests for the Markdown helpers.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import {
  escapeMarkdown,
  escapeTableCell,
  findTable,
  formatTableRow,
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
