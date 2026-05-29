import { describe, expect, it } from "vitest";
import { DEFAULT_ALLOWANCE_CONFIG } from "./defaults";
import {
  attendanceAllowance,
  attendanceBracket,
  attendancePercentage,
  calcAllowance,
  otherTotal,
  teachingAllowance,
} from "./calc";
import type { AllowanceInput } from "./types";

const cfg = DEFAULT_ALLOWANCE_CONFIG;

describe("attendance", () => {
  it("collapses below 95% to RM0", () => {
    expect(attendanceAllowance("I3", 0.949, cfg)).toBe(0);
    expect(attendanceAllowance("I3", 0.949999, cfg)).toBe(0);
    // 1 − 9/160 = 0.94375
    expect(attendanceAllowance("A1", attendancePercentage(160, 9), cfg)).toBe(0);
  });

  it("pays 'met' from exactly 95% up to (not incl.) 100%", () => {
    // 1 − 8/160 is mathematically 0.95 but ~1e-16 low in float; must still be 'met'.
    expect(attendanceBracket(attendancePercentage(160, 8))).toBe("met");
    expect(attendanceAllowance("I3", attendancePercentage(160, 8), cfg)).toBe(350);
    expect(attendanceAllowance("I2", 0.999, cfg)).toBe(270);
    expect(attendanceAllowance("A1", 0.95, cfg)).toBe(200);
  });

  it("pays 'perfect' only at exactly 100% (no leave)", () => {
    expect(attendancePercentage(160, 0)).toBe(1);
    expect(attendanceAllowance("I3", 1, cfg)).toBe(500);
    expect(attendanceAllowance("I2", 1, cfg)).toBe(400);
    expect(attendanceAllowance("A1", 1, cfg)).toBe(300);
  });

  it("guards a zero/negative operating-hours denominator", () => {
    expect(attendancePercentage(0, 0)).toBe(0);
    expect(attendanceAllowance("I3", attendancePercentage(0, 0), cfg)).toBe(0);
  });
});

describe("teaching", () => {
  it("admins (A1–A3) and PA earn no teaching allowance", () => {
    const rows = [{ center: "HQ", normalH: 100, ysH: 100, precompH: 100 }];
    for (const t of ["A1", "A2", "A3", "PA"] as const) {
      expect(teachingAllowance(t, rows, cfg)).toBe(0);
    }
  });

  it("sums hours × tier rate across class types and centers", () => {
    // I3 rates: normal 17, ys 27, precomp 21
    const rows = [
      { center: "HQ", normalH: 10, ysH: 5, precompH: 2 },
      { center: "Berkeley", normalH: 4, ysH: 0, precompH: 1 },
    ];
    // (10*17 + 5*27 + 2*21) + (4*17 + 0 + 1*21) = 347 + 89 = 436
    expect(teachingAllowance("I3", rows, cfg)).toBe(436);
  });

  it("applies precomp/lifesaving rate for I2/I3 only by default", () => {
    const rows = [{ center: "HQ", normalH: 0, ysH: 0, precompH: 10 }];
    expect(teachingAllowance("T4", rows, cfg)).toBe(0); // T4 precomp rate is 0
    expect(teachingAllowance("I3", rows, cfg)).toBe(210); // 10 * 21
  });
});

describe("otherTotal", () => {
  it("sums amounts and ignores non-finite", () => {
    expect(
      otherTotal([
        { center: "", reason: "a", amount: 10 },
        { center: "", reason: "b", amount: NaN },
        { center: "", reason: "c", amount: 5 },
      ]),
    ).toBe(15);
  });
});

describe("calcAllowance", () => {
  it("grand total = attendance + teaching + other", () => {
    const input: AllowanceInput = {
      coachId: null,
      name: "TEST COACH",
      tier: "I2",
      center: "HQ",
      opHours: 160,
      leaveHours: 0, // perfect → 400
      teachingRows: [{ center: "HQ", normalH: 10, ysH: 10, precompH: 0 }], // 10*13 + 10*20 = 330
      otherItems: [
        { center: "HQ", reason: "Travel", amount: 50 },
        { center: "HQ", reason: "Bonus", amount: 25 },
      ],
    };
    const r = calcAllowance(input, cfg);
    expect(r.attendance).toBe(400);
    expect(r.teaching).toBe(330);
    expect(r.other).toBe(75);
    expect(r.grandTotal).toBe(805);
  });
});
