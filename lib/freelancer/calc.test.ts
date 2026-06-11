import { describe, expect, it } from "vitest";
import { calcFreelancer, commitmentFor, rateFor, resultRate } from "./calc";
import { DEFAULT_FREELANCER_CONFIG } from "./defaults";
import type { FreelancerInput, FreelancerPosition } from "./types";

const cfg = DEFAULT_FREELANCER_CONFIG;

function mkInput(overrides: Partial<FreelancerInput> = {}): FreelancerInput {
  return {
    coachId: null,
    name: "TEST COACH",
    position: "T1",
    icNo: "",
    bankName: "",
    bankAccount: "",
    centerRows: [],
    blackCount: 0,
    colourCount: 0,
    extras: [],
    ...overrides,
  };
}

describe("rateFor", () => {
  it("uses the groupA rate for HQ/BK/BT and groupB elsewhere", () => {
    expect(rateFor("T1", "HQ", cfg)).toBe(16);
    expect(rateFor("T1", "BK", cfg)).toBe(16);
    expect(rateFor("T1", "BT", cfg)).toBe(16);
    expect(rateFor("T1", "PK", cfg)).toBe(18);
    expect(rateFor("I1", "HQ", cfg)).toBe(26);
    expect(rateFor("I1", "KM", cfg)).toBe(30);
    expect(rateFor("A1", "QSM", cfg)).toBe(13);
  });

  it("matches group A centers case-insensitively", () => {
    expect(rateFor("T2", "hq", cfg)).toBe(18);
    expect(rateFor("T2", " BK ", cfg)).toBe(18);
  });
});

describe("resultRate", () => {
  it("is 1 − black/colour for T1+ positions", () => {
    expect(resultRate("T1", 2, 20)).toBeCloseTo(0.9, 10);
    expect(resultRate("I1", 5, 10)).toBeCloseTo(0.5, 10);
  });

  it("is forced to 0 for non-result positions (T0 and below)", () => {
    expect(resultRate("T0", 2, 20)).toBe(0);
    expect(resultRate("PA", 0, 20)).toBe(0);
    expect(resultRate("A1", 0, 20)).toBe(0);
  });

  it("is 0 when colour count is 0", () => {
    expect(resultRate("T1", 0, 0)).toBe(0);
    expect(resultRate("T1", 3, 0)).toBe(0);
  });
});

describe("commitmentFor (matrix edges)", () => {
  it("A1/A2/A3 never earn commitment, even with big hours + result", () => {
    for (const p of ["A1", "A2", "A3"] as FreelancerPosition[]) {
      expect(commitmentFor(p, 100, 0.95, cfg)).toBe(0);
    }
  });

  it("below 31 hours → 0 for every result column", () => {
    expect(commitmentFor("T1", 0, 0.9, cfg)).toBe(0);
    expect(commitmentFor("T1", 30, 0.9, cfg)).toBe(0);
    expect(commitmentFor("T1", 30.9, 0.95, cfg)).toBe(0);
  });

  it("approximate match picks the largest threshold ≤ value on both axes", () => {
    // Hours rows: 31+, 41+, 51+ (exact boundary lands in the new row).
    expect(commitmentFor("T1", 31, 0.9, cfg)).toBe(0.15);
    expect(commitmentFor("T1", 40, 0.9, cfg)).toBe(0.15);
    expect(commitmentFor("T1", 41, 0.9, cfg)).toBe(0.2);
    expect(commitmentFor("T1", 51, 0.9, cfg)).toBe(0.25);
    expect(commitmentFor("T1", 200, 0.9, cfg)).toBe(0.25);
    // Result columns: <0.7, 0.7+, 0.85+.
    expect(commitmentFor("T1", 45, 0.69, cfg)).toBe(0.1);
    expect(commitmentFor("T1", 45, 0.7, cfg)).toBe(0.15);
    expect(commitmentFor("T1", 45, 0.85, cfg)).toBe(0.2);
  });

  it("T0 earns commitment but its result is the 0-column", () => {
    // resultRate("T0", …) is forced to 0, so the lookup uses column 0.
    const result = resultRate("T0", 2, 20);
    expect(result).toBe(0);
    expect(commitmentFor("T0", 45, result, cfg)).toBe(0.1);
  });

  it("is order-independent: shuffled threshold rows still pick the right bonus", () => {
    // The matrix is operator-editable; a row reorder (thresholds + their value
    // rows moved together) must not change the looked-up bonus.
    const shuffled = structuredClone(cfg);
    shuffled.commitment = {
      hourThresholds: [51, 0, 41, 31],
      resultThresholds: [0, 0.7, 0.85],
      values: [
        [0.15, 0.2, 0.25], // 51
        [0, 0, 0], // 0
        [0.1, 0.15, 0.2], // 41
        [0.05, 0.1, 0.15], // 31
      ],
    };
    for (const [hours, result] of [
      [30, 0.9],
      [31, 0.9],
      [40, 0.69],
      [45, 0.85],
      [200, 0.95],
    ] as const) {
      expect(commitmentFor("T1", hours, result, shuffled)).toBe(
        commitmentFor("T1", hours, result, cfg),
      );
    }
  });
});

describe("calcFreelancer (worked example from the operator's Excel)", () => {
  const base = mkInput({
    position: "T1",
    blackCount: 2,
    colourCount: 20,
    centerRows: [
      { center: "HQ", replacedHours: 10, fixedHours: 25, absent: false },
      { center: "PK", replacedHours: 0, fixedHours: 10, absent: false },
    ],
  });

  it("computes the full breakdown with no absence", () => {
    const r = calcFreelancer(base, cfg);
    expect(r.totalServiceHours).toBe(45);
    expect(r.result).toBeCloseTo(0.9, 10);
    expect(r.commitment).toBe(0.2);
    expect(r.attendance).toBe(0.2);
    // HQ rate 16: 16 × (10×1.2 + 25×1.4) = 16 × 47 = 752.
    expect(r.centerPayments).toEqual([
      { center: "HQ", rate: 16, payment: 752 },
      // PK rate 18: 18 × (10×1.4) = 252.
      { center: "PK", rate: 18, payment: 252 },
    ]);
    // Both HQ and PK belong to OT.
    expect(r.entityTotals.find((e) => e.entity === "OT")?.amount).toBe(1004);
    expect(r.entityTotals.find((e) => e.entity === "OTG")?.amount).toBe(0);
    expect(r.grandTotal).toBe(1004);
  });

  it("any absence zeroes the attendance bonus and an extra lands on its entity", () => {
    const r = calcFreelancer(
      {
        ...base,
        centerRows: [
          { center: "HQ", replacedHours: 10, fixedHours: 25, absent: true },
          { center: "PK", replacedHours: 0, fixedHours: 10, absent: false },
        ],
        extras: [{ entity: "OTG", reason: "Workshop", amount: 100 }],
      },
      cfg,
    );
    expect(r.attendance).toBe(0);
    // HQ: 16 × (10×1.2 + 25×1.2) = 672; PK: 18 × (10×1.2) = 216.
    expect(r.centerPayments).toEqual([
      { center: "HQ", rate: 16, payment: 672 },
      { center: "PK", rate: 18, payment: 216 },
    ]);
    expect(r.entityTotals.find((e) => e.entity === "OT")?.amount).toBe(888);
    expect(r.entityTotals.find((e) => e.entity === "OTG")?.amount).toBe(100);
    expect(r.grandTotal).toBe(988);
  });
});

describe("calcFreelancer (positions + grouping)", () => {
  it("A1 never gets commitment but still earns the attendance bonus on fixed hours", () => {
    const r = calcFreelancer(
      mkInput({
        position: "A1",
        blackCount: 0,
        colourCount: 50,
        centerRows: [{ center: "HQ", replacedHours: 10, fixedHours: 50, absent: false }],
      }),
      cfg,
    );
    expect(r.commitment).toBe(0);
    expect(r.attendance).toBe(0.2);
    // A1 HQ rate 12: 12 × (10×1.0 + 50×1.2) = 12 × 70 = 840.
    expect(r.centerPayments[0].payment).toBe(840);
    expect(r.grandTotal).toBe(840);
  });

  it("T0 gets commitment (column 0) and below-31-hours gets none", () => {
    const t0 = calcFreelancer(
      mkInput({
        position: "T0",
        blackCount: 2,
        colourCount: 20,
        centerRows: [{ center: "PK", replacedHours: 45, fixedHours: 0, absent: false }],
      }),
      cfg,
    );
    // result forced 0 → column 0; 45h → row 41+ → 0.10.
    expect(t0.result).toBe(0);
    expect(t0.commitment).toBe(0.1);

    const small = calcFreelancer(
      mkInput({
        position: "T1",
        blackCount: 2,
        colourCount: 20,
        centerRows: [{ center: "HQ", replacedHours: 5, fixedHours: 20, absent: false }],
      }),
      cfg,
    );
    expect(small.totalServiceHours).toBe(25);
    expect(small.commitment).toBe(0);
  });

  it("groups every default center onto its paying entity", () => {
    const r = calcFreelancer(
      mkInput({
        position: "T1",
        centerRows: [
          { center: "HQ", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "BK", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "BT", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "PK", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "KK", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "USJ", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "PJ", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "QSM", replacedHours: 1, fixedHours: 0, absent: false },
          { center: "KM", replacedHours: 1, fixedHours: 0, absent: false },
        ],
      }),
      cfg,
    );
    // 9 hours total → below 31 → no commitment; replaced hours ignore attendance.
    const by = Object.fromEntries(r.entityTotals.map((e) => [e.entity, e.amount]));
    expect(by.OT).toBe(16 + 16 + 16 + 18); // HQ+BK+BT (groupA) + PK (groupB)
    expect(by.OTG).toBe(18 + 18); // KK + USJ
    expect(by.PJ).toBe(18);
    expect(by.QSM).toBe(18);
    expect(by.KM).toBe(18);
    expect(r.grandTotal).toBe(by.OT + by.OTG + by.PJ + by.QSM + by.KM);
  });

  it("extras with any count sum onto their entity; money rounds to 2dp at the end", () => {
    const r = calcFreelancer(
      mkInput({
        position: "T3",
        centerRows: [{ center: "PJ", replacedHours: 3.5, fixedHours: 0, absent: false }],
        extras: [
          { entity: "PJ", reason: "Petrol", amount: 10.333 },
          { entity: "PJ", reason: "Meeting", amount: 5.111 },
          { entity: "KM", reason: "Event", amount: 50 },
        ],
      }),
      cfg,
    );
    // PJ rate for T3 is 23 → 3.5h × 23 = 80.5; + extras 15.444 → 95.944 → 95.94.
    expect(r.entityTotals.find((e) => e.entity === "PJ")?.amount).toBe(95.94);
    expect(r.entityTotals.find((e) => e.entity === "KM")?.amount).toBe(50);
    expect(r.grandTotal).toBe(145.94);
  });
});
