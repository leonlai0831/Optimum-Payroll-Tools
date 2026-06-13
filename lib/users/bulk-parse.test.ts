import { describe, expect, it } from "vitest";
import { countValid, rowsFromGrid } from "./bulk-parse";

describe("rowsFromGrid", () => {
  it("reads a headerless grid as email, name (the old paste format)", () => {
    const rows = rowsFromGrid([
      ["darren@example.com", "Darren Lee"],
      ["evi@example.com", "Evi Chow"],
    ]);
    expect(rows).toEqual([
      { email: "darren@example.com", displayName: "Darren Lee" },
      { email: "evi@example.com", displayName: "Evi Chow" },
    ]);
  });

  it("maps columns by header in any order", () => {
    const rows = rowsFromGrid([
      ["Name", "Email", "Note"],
      ["Darren Lee", "darren@example.com", "x"],
      ["Evi Chow", "evi@example.com", ""],
    ]);
    expect(rows).toEqual([
      { email: "darren@example.com", displayName: "Darren Lee" },
      { email: "evi@example.com", displayName: "Evi Chow" },
    ]);
  });

  it("prefers a display name / nickname column over a plain name", () => {
    const rows = rowsFromGrid([
      ["Email", "Full Name", "Nickname"],
      ["a@b.com", "Alexander Tan", "Alex"],
    ]);
    expect(rows).toEqual([{ email: "a@b.com", displayName: "Alex" }]);
  });

  it("trims whitespace and skips blank rows", () => {
    const rows = rowsFromGrid([
      ["  amy@example.com  ", "  Amy  "],
      ["", ""],
      ["   ", undefined],
      ["ben@example.com"],
    ]);
    expect(rows).toEqual([
      { email: "amy@example.com", displayName: "Amy" },
      { email: "ben@example.com", displayName: "" },
    ]);
  });

  it("drops rows with no email cell", () => {
    const rows = rowsFromGrid([
      ["Email", "Name"],
      ["", "No Email"],
      ["c@d.com", "Cara"],
    ]);
    expect(rows).toEqual([{ email: "c@d.com", displayName: "Cara" }]);
  });

  it("does not treat a data email as a header", () => {
    // First row is data (no literal 'email' header word) — must not be eaten.
    const rows = rowsFromGrid([["first@x.com", "First"], ["second@x.com", "Second"]]);
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe("first@x.com");
  });

  it("coerces numeric cells to text", () => {
    const rows = rowsFromGrid([["Email", "Name"], ["x@y.com", 12345 as unknown as string]]);
    expect(rows).toEqual([{ email: "x@y.com", displayName: "12345" }]);
  });

  it("returns nothing for an empty grid", () => {
    expect(rowsFromGrid([])).toEqual([]);
    expect(rowsFromGrid([[""], [" "]])).toEqual([]);
  });
});

describe("countValid", () => {
  it("counts only well-formed emails", () => {
    const n = countValid([
      { email: "ok@example.com", displayName: "" },
      { email: "not-an-email", displayName: "" },
      { email: "also.ok@sub.domain.io", displayName: "" },
    ]);
    expect(n).toBe(2);
  });
});
