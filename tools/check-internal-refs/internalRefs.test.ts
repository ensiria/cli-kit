/**
 * Tests for the references to notes that live outside this repository: decision ids, numbered notes and the private
 * repository's name are found, ordinary text is not.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { internalReferences } from "./internalRefs.ts";

describe("internalReferences", () => {
  it("finds decision ids, numbered notes and the private repository's name", () => {
    expect(internalReferences("a story's declared height (D-469)")).toEqual([
      { kind: "decision id", text: "(D-469)" }
    ]);
    expect(internalReferences("the foot handle, note 142, sets the height")).toEqual([
      { kind: "numbered note", text: "note 142" }
    ]);
    expect(internalReferences("moved out of dev-tooling into its own repository")).toEqual([
      { kind: "private repository", text: "dev-tooling" }
    ]);
    expect(internalReferences("D-492 and Notes 7")).toEqual([
      { kind: "decision id", text: "D-492" },
      { kind: "numbered note", text: "Notes 7" }
    ]);
  });

  it("leaves ordinary text alone", () => {
    expect(
      internalReferences(
        "Node 24, a note about the height, D-Bus, 3D-printed, devtools, a 2D-grid, footnote 3"
      )
    ).toEqual([]);
  });
});
