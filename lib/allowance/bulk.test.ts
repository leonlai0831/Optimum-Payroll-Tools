import { describe, expect, it } from "vitest";
import { extractCenterHours, mergeBulkRow, type BulkRow } from "./bulk";
import type { AllowanceInput } from "./types";

const row: BulkRow = {
  coachId: 1,
  name: "JANE TAN",
  tier: "T2",
  center: "BK",
  opHours: 160,
  leaveHours: 8,
  normalH: 10,
  ysH: 4,
  precompH: 0,
};

describe("mergeBulkRow", () => {
  it("creates a fresh record when none exists", () => {
    const out = mergeBulkRow(row, null);
    expect(out.name).toBe("JANE TAN");
    expect(out.opHours).toBe(160);
    expect(out.teachingRows).toEqual([{ center: "BK", normalH: 10, ysH: 4, precompH: 0 }]);
    expect(out.center).toBe("BK");
  });

  it("preserves another center's teaching row (multi-center invariant)", () => {
    const existing: AllowanceInput = {
      coachId: 1,
      name: "JANE TAN",
      tier: "T2",
      center: "HQ",
      opHours: 160,
      leaveHours: 0,
      teachingRows: [{ center: "HQ", normalH: 20, ysH: 0, precompH: 0 }],
      otherItems: [{ center: "HQ", reason: "Event", amount: 50 }],
    };
    const out = mergeBulkRow(row, existing);
    // HQ row kept, BK row added.
    expect(out.teachingRows).toContainEqual({ center: "HQ", normalH: 20, ysH: 0, precompH: 0 });
    expect(out.teachingRows).toContainEqual({ center: "BK", normalH: 10, ysH: 4, precompH: 0 });
    expect(out.center).toBe("HQ, BK");
    // Other items untouched.
    expect(out.otherItems).toEqual([{ center: "HQ", reason: "Event", amount: 50 }]);
  });

  it("replaces only the selected center's row on re-entry", () => {
    const existing: AllowanceInput = {
      coachId: 1,
      name: "JANE TAN",
      tier: "T2",
      center: "HQ, BK",
      opHours: 160,
      leaveHours: 0,
      teachingRows: [
        { center: "HQ", normalH: 20, ysH: 0, precompH: 0 },
        { center: "BK", normalH: 5, ysH: 0, precompH: 0 },
      ],
      otherItems: [],
    };
    const out = mergeBulkRow({ ...row, normalH: 99 }, existing);
    expect(out.teachingRows).toContainEqual({ center: "HQ", normalH: 20, ysH: 0, precompH: 0 });
    expect(out.teachingRows).toContainEqual({ center: "BK", normalH: 99, ysH: 4, precompH: 0 });
    expect(out.teachingRows.filter((t) => t.center === "BK").length).toBe(1);
  });

  it("drops the selected center's row when its hours are cleared to zero", () => {
    const existing: AllowanceInput = {
      coachId: 1,
      name: "JANE TAN",
      tier: "T2",
      center: "HQ, BK",
      opHours: 160,
      leaveHours: 0,
      teachingRows: [
        { center: "HQ", normalH: 20, ysH: 0, precompH: 0 },
        { center: "BK", normalH: 5, ysH: 0, precompH: 0 },
      ],
      otherItems: [],
    };
    const out = mergeBulkRow({ ...row, normalH: 0, ysH: 0, precompH: 0 }, existing);
    expect(out.teachingRows).toEqual([{ center: "HQ", normalH: 20, ysH: 0, precompH: 0 }]);
    expect(out.center).toBe("HQ");
  });
});

describe("extractCenterHours", () => {
  it("returns the selected center's hours, or zeros", () => {
    const input: AllowanceInput = {
      coachId: 1,
      name: "X",
      tier: "T2",
      center: "HQ",
      opHours: 0,
      leaveHours: 0,
      teachingRows: [{ center: "HQ", normalH: 7, ysH: 2, precompH: 1 }],
      otherItems: [],
    };
    expect(extractCenterHours(input, "HQ")).toEqual({ normalH: 7, ysH: 2, precompH: 1 });
    expect(extractCenterHours(input, "BK")).toEqual({ normalH: 0, ysH: 0, precompH: 0 });
    expect(extractCenterHours(null, "HQ")).toEqual({ normalH: 0, ysH: 0, precompH: 0 });
  });
});
