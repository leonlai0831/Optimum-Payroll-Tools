import { describe, expect, it } from "vitest";
import { includesText, makeComparator, triState } from "./table-controls";

describe("triState — select-all tri-state over a list of ids", () => {
  it("is 'none' for an empty list", () => {
    expect(triState(0, 0)).toBe("none");
  });

  it("is 'none' when nothing is selected", () => {
    expect(triState(0, 5)).toBe("none");
  });

  it("is 'some' for a partial selection", () => {
    expect(triState(1, 5)).toBe("some");
    expect(triState(4, 5)).toBe("some");
  });

  it("is 'all' when every id is selected", () => {
    expect(triState(5, 5)).toBe("all");
  });

  it("is defensive against counts past the total (stale list) → 'all'", () => {
    expect(triState(6, 5)).toBe("all");
  });

  it("is defensive against negative/empty totals → 'none'", () => {
    expect(triState(3, 0)).toBe("none");
    expect(triState(-1, 5)).toBe("none");
  });
});

describe("includesText — case-insensitive, trimmed substring match", () => {
  it("matches everything for an empty/whitespace needle", () => {
    expect(includesText("anything", "")).toBe(true);
    expect(includesText("anything", "   ")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(includesText("Coby Tan", "coby")).toBe(true);
    expect(includesText("coby tan", "TAN")).toBe(true);
  });

  it("trims the needle", () => {
    expect(includesText("Berkeley", "  berk ")).toBe(true);
  });

  it("returns false when absent", () => {
    expect(includesText("Berkeley", "puchong")).toBe(false);
  });
});

describe("makeComparator — sort with empty-last + numeric-aware ordering", () => {
  type Row = { name: string; hours: number | null };
  const rows: Row[] = [
    { name: "Bravo", hours: 10 },
    { name: "alpha", hours: 2 },
    { name: "Charlie", hours: null },
  ];
  const accessors = {
    name: (r: Row) => r.name,
    hours: (r: Row) => r.hours,
  } as const;

  it("returns a no-op comparator when sort is null", () => {
    const cmp = makeComparator(accessors, null);
    expect([...rows].sort(cmp)).toEqual(rows);
  });

  it("sorts strings case-insensitively ascending", () => {
    const cmp = makeComparator(accessors, { key: "name", dir: "asc" });
    expect([...rows].sort(cmp).map((r) => r.name)).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("reverses for descending", () => {
    const cmp = makeComparator(accessors, { key: "name", dir: "desc" });
    expect([...rows].sort(cmp).map((r) => r.name)).toEqual(["Charlie", "Bravo", "alpha"]);
  });

  it("compares numbers numerically and sorts empties last regardless of direction", () => {
    const asc = makeComparator(accessors, { key: "hours", dir: "asc" });
    expect([...rows].sort(asc).map((r) => r.hours)).toEqual([2, 10, null]);
    const desc = makeComparator(accessors, { key: "hours", dir: "desc" });
    // null (empty) still sinks to the bottom even though direction flipped.
    expect([...rows].sort(desc).map((r) => r.hours)).toEqual([10, 2, null]);
  });

  it("uses natural numeric ordering inside strings", () => {
    const r: { v: string }[] = [{ v: "Item 10" }, { v: "Item 2" }];
    const cmp = makeComparator({ v: (x: { v: string }) => x.v }, { key: "v", dir: "asc" });
    expect([...r].sort(cmp).map((x) => x.v)).toEqual(["Item 2", "Item 10"]);
  });
});
