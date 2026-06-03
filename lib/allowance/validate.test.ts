import { describe, expect, it } from "vitest";
import { validateAllowanceInput } from "./validate";
import type { AllowanceInput } from "./types";

const base: AllowanceInput = {
  coachId: null,
  name: "JANE TAN",
  tier: "T1",
  center: "HQ",
  opHours: 160,
  leaveHours: 0,
  teachingRows: [{ center: "HQ", normalH: 10, ysH: 0, precompH: 0 }],
  otherItems: [],
};

const codes = (input: AllowanceInput) => validateAllowanceInput(input).map((w) => w.code);

describe("validateAllowanceInput", () => {
  it("returns no warnings for a clean entry", () => {
    expect(validateAllowanceInput(base)).toEqual([]);
  });

  it("flags leave hours exceeding operating hours", () => {
    expect(codes({ ...base, opHours: 100, leaveHours: 120 })).toContain("leave_exceeds_op");
  });

  it("flags zero operating hours (and not leave_exceeds_op)", () => {
    const c = codes({ ...base, opHours: 0, leaveHours: 0 });
    expect(c).toContain("no_op_hours");
    expect(c).not.toContain("leave_exceeds_op");
  });

  it("flags a teaching row with hours but no center", () => {
    expect(
      codes({ ...base, teachingRows: [{ center: "", normalH: 5, ysH: 0, precompH: 0 }] }),
    ).toContain("teaching_row_no_center");
  });

  it("ignores an empty teaching row (no hours, no center)", () => {
    expect(
      codes({ ...base, teachingRows: [{ center: "", normalH: 0, ysH: 0, precompH: 0 }] }),
    ).not.toContain("teaching_row_no_center");
  });

  it("flags negative values", () => {
    expect(codes({ ...base, otherItems: [{ center: "HQ", reason: "x", amount: -5 }] })).toContain(
      "negative_input",
    );
  });
});
