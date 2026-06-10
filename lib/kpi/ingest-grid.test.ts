import { describe, expect, it } from "vitest";
import type { InstructorRow } from "./types";
import {
  filterGridRows,
  parseNumericCell,
  sortGridRows,
  toGridRows,
} from "./ingest-grid";

function row(over: Partial<InstructorRow> = {}): InstructorRow {
  return {
    Center: "Berkeley",
    Instructor: "HONG LI [BK]",
    TotalStudent: 150,
    TotalColor: 40,
    Black: 4,
    LevelUp: 12,
    Downgrade: 0,
    Switch: 0,
    Stop: 1,
    Attended: 600,
    ...over,
  };
}

describe("toGridRows", () => {
  it("assigns sequential stable ids", () => {
    const rows = toGridRows([row(), row({ Instructor: "B" }), row({ Instructor: "C" })]);
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2]);
    expect(rows[1].data.Instructor).toBe("B");
  });
});

describe("filterGridRows", () => {
  const rows = toGridRows([
    row({ Instructor: "COBYS [BK]", Center: "Berkeley" }),
    row({ Instructor: "HONG LI", Center: "Puchong Kinrara" }),
    row({ Instructor: "Aina", Center: "Subang USJ" }),
  ]);

  it("returns the same array for an empty/whitespace query", () => {
    expect(filterGridRows(rows, "")).toBe(rows);
    expect(filterGridRows(rows, "   ")).toBe(rows);
  });

  it("matches Instructor case-insensitively", () => {
    expect(filterGridRows(rows, "cobys").map((r) => r.id)).toEqual([0]);
  });

  it("matches Center case-insensitively", () => {
    expect(filterGridRows(rows, "puchong").map((r) => r.id)).toEqual([1]);
  });

  it("keeps stable ids so edits map back to the full set", () => {
    const visible = filterGridRows(rows, "aina");
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe(2); // id, not the filtered position 0
  });

  it("returns nothing when no row matches", () => {
    expect(filterGridRows(rows, "zzz")).toHaveLength(0);
  });
});

describe("sortGridRows", () => {
  const rows = toGridRows([
    row({ Instructor: "charlie" }),
    row({ Instructor: "Alpha" }),
    row({ Instructor: "BRAVO" }),
  ]);

  it("null keeps the original order (same array)", () => {
    expect(sortGridRows(rows, null)).toBe(rows);
  });

  it("sorts ascending case-insensitively without mutating the input", () => {
    const sorted = sortGridRows(rows, "asc");
    expect(sorted.map((r) => r.data.Instructor)).toEqual(["Alpha", "BRAVO", "charlie"]);
    expect(rows.map((r) => r.data.Instructor)).toEqual(["charlie", "Alpha", "BRAVO"]);
  });

  it("sorts descending", () => {
    const sorted = sortGridRows(rows, "desc");
    expect(sorted.map((r) => r.data.Instructor)).toEqual(["charlie", "BRAVO", "Alpha"]);
  });

  it("preserves stable ids through the sort", () => {
    const sorted = sortGridRows(rows, "asc");
    expect(sorted.map((r) => r.id)).toEqual([1, 2, 0]);
  });
});

describe("parseNumericCell", () => {
  it("parses integers and decimals", () => {
    expect(parseNumericCell("42")).toBe(42);
    expect(parseNumericCell(" 3.5 ")).toBe(3.5);
    expect(parseNumericCell("-2")).toBe(-2);
  });

  it("coerces empty and garbage input to 0", () => {
    expect(parseNumericCell("")).toBe(0);
    expect(parseNumericCell("abc")).toBe(0);
    expect(parseNumericCell("Infinity")).toBe(0);
  });
});
