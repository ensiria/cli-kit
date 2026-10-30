/**
 * Tests for the layout helpers.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { box, columns, keyValue, list, table, tree } from "../src/layout.ts";
import type { OutputStyle } from "../src/log.types.ts";
import { stripAnsi, width } from "../src/text.ts";

const plain: OutputStyle = { color: false, unicode: true, width: 80 };
const ascii: OutputStyle = { color: false, unicode: false, width: 80 };

describe("table", () => {
  const rows = [
    ["build-order", 305, "packages/design-system/tools/build-order.mts"],
    ["e2e", 12, "e2e/run.ts"]
  ];
  const tableColumns = [
    { header: "Script" },
    { header: "Rows" },
    { header: "Path", truncate: "middle" as const }
  ];

  it("aligns columns, numbers to the right, with a rule under the header", () => {
    expect(table(rows, { columns: tableColumns }, plain)).toBe(
      [
        "Script       Rows  Path",
        "───────────  ────  ────────────────────────────────────────────",
        "build-order   305  packages/design-system/tools/build-order.mts",
        "e2e            12  e2e/run.ts"
      ].join("\n")
    );
  });

  it("fits the terminal by shrinking the widest column", () => {
    const narrow = table(rows, { columns: tableColumns }, { ...plain, width: 40 });
    for (const line of narrow.split("\n")) expect(width(line)).toBeLessThanOrEqual(40);
    expect(narrow).toContain("packages/d…-order.mts");
  });

  it("draws borders, in ASCII too", () => {
    const bordered = table([["a", 1]], { columns: [{ header: "N" }, { header: "V" }], border: true }, ascii);
    expect(bordered).toBe(["+---+---+", "| N | V |", "+---+---+", "| a | 1 |", "+---+---+"].join("\n"));
    expect(table([["a", 1]], { columns: [{ header: "N" }, { header: "V" }], border: true }, plain)).toBe(
      ["╭───┬───╮", "│ N │ V │", "├───┼───┤", "│ a │ 1 │", "╰───┴───╯"].join("\n")
    );
  });

  it("can hide the header, and leaves empty cells blank", () => {
    expect(
      table([["a", null]], { columns: [{ header: "X" }, { header: "Y" }], hideHeader: true }, plain)
    ).toBe("a");
  });

  it("colours headers and toned cells only with colour on", () => {
    const coloured = table(
      [["ok"]],
      { columns: [{ header: "S", tone: "success" }] },
      { ...plain, color: true }
    );
    expect(coloured).toContain("\u001B[32mok");
    expect(stripAnsi(coloured)).toBe("S\n──\nok");
  });
});

describe("keyValue", () => {
  it("aligns labels", () => {
    expect(
      keyValue(
        [
          ["Rows", 305],
          ["Waves", "13"]
        ],
        plain
      )
    ).toBe("Rows   305\nWaves  13");
  });
});

describe("list", () => {
  it("draws bullets, numbers and nesting", () => {
    expect(list(["a", { text: "b", children: ["c"] }], plain)).toBe("• a\n• b\n  • c");
    expect(list(["a", "b"], plain, { ordered: true })).toBe("1. a\n2. b");
    expect(list(["a"], ascii)).toBe("* a");
  });
});

describe("tree", () => {
  it("draws branches", () => {
    const root = {
      label: "src",
      children: [{ label: "a.ts" }, { label: "lib", children: [{ label: "b.ts" }] }]
    };
    expect(tree(root, plain)).toBe("src\n├─ a.ts\n└─ lib\n   └─ b.ts");
    expect(tree(root, ascii)).toBe("src\n|- a.ts\n`- lib\n   `- b.ts");
  });
});

describe("box", () => {
  it("frames text with a title", () => {
    expect(box("3 files\nall good", plain, { title: "Done" })).toBe(
      ["╭─ Done ───╮", "│ 3 files  │", "│ all good │", "╰──────────╯"].join("\n")
    );
  });

  it("frames without a title, in ASCII", () => {
    expect(box("hi", ascii)).toBe(["+----+", "| hi |", "+----+"].join("\n"));
  });

  it("cuts lines longer than the terminal", () => {
    const framed = box("x".repeat(100), { ...plain, width: 30 });
    for (const line of framed.split("\n")) expect(width(line)).toBeLessThanOrEqual(30);
  });
});

describe("columns", () => {
  it("fills columns top to bottom within the width", () => {
    expect(columns(["a", "b", "c", "d", "e"], { ...plain, width: 8 })).toBe("a  c  e\nb  d");
    expect(columns([], plain)).toBe("");
  });
});
