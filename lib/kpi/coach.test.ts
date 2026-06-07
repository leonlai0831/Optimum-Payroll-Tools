import { describe, expect, it } from "vitest";
import { computeCoach, type CoachInputs } from "./coach";
import {
  DEFAULT_CENTER_KPI,
  DEFAULT_CENTER_TARGETS,
  DEFAULT_GRADE_THRESHOLDS,
  DEFAULT_PERSONAL_KPI,
} from "./metrics";
import { DEFAULT_CLASSIFY_CONFIG } from "./classify";
import type { AppConfig, InstructorRow } from "./types";

/** A complete AppConfig built from the v11.1 defaults, no DB import needed. */
function makeConfig(): AppConfig {
  return {
    personalKpi: structuredClone(DEFAULT_PERSONAL_KPI),
    centerKpi: structuredClone(DEFAULT_CENTER_KPI),
    centerTargets: structuredClone(DEFAULT_CENTER_TARGETS),
    gradeThresholds: { ...DEFAULT_GRADE_THRESHOLDS },
    classify: structuredClone(DEFAULT_CLASSIFY_CONFIG),
  };
}

const ROW = (over: Partial<InstructorRow> = {}): InstructorRow => ({
  Center: "Berkeley",
  Instructor: "COBYS [BK]",
  TotalStudent: 123,
  TotalColor: 62,
  Black: 9,
  LevelUp: 4,
  Downgrade: 0,
  Switch: 3,
  Stop: 4,
  Attended: 503,
  ...over,
});

const baseInputs = (over: Partial<CoachInputs> = {}): CoachInputs => ({
  position: "Instructor",
  teachingAllowance: 1000,
  mgmtAssessment: 85,
  groupConfig: null,
  ...over,
});

describe("computeCoach — instructor (no group)", () => {
  it("finalScore equals personalScore; payout = finalScore × teachingAllowance", () => {
    const rows = [ROW()];
    const out = computeCoach({
      accounts: ["COBYS [BK]"],
      rows,
      config: makeConfig(),
      inputs: baseInputs({ teachingAllowance: 1000 }),
    });

    expect(out.groupScore).toBe(0);
    expect(out.finalScore).toBe(out.personalScore);
    // payout follows the documented formula exactly.
    expect(out.payout).toBeCloseTo(out.finalScore * 1000, 6);
    expect(out.isComplete).toBe(true);
    expect(out.missing).toEqual([]);
    // sanity: the known v11.1 golden score for COBYS [BK] @ mgmt 85.
    expect(out.finalScore).toBeCloseTo(0.9354, 3);
  });
});

describe("computeCoach — supervisor with a group config", () => {
  it("averages personal + group: finalScore = (personal + group) / 2", () => {
    // Two centers' rows so the group score is non-trivial.
    const rows = [
      ROW({ Instructor: "SUP [BK]", Center: "Berkeley" }),
      ROW({ Instructor: "OTHER [BK]", Center: "Berkeley", TotalStudent: 200, LevelUp: 30 }),
    ];
    const out = computeCoach({
      accounts: ["SUP [BK]"],
      rows,
      config: makeConfig(),
      inputs: baseInputs({
        position: "Pool Supervisor",
        groupConfig: { center1: "Berkeley", hours1: 40 },
      }),
    });

    expect(out.groupScore).toBeGreaterThan(0);
    expect(out.finalScore).toBeCloseTo((out.personalScore + out.groupScore) / 2, 9);
    // average must differ from the bare personal score here.
    expect(out.finalScore).not.toBeCloseTo(out.personalScore, 9);
    expect(out.payout).toBeCloseTo(out.finalScore * 1000, 6);
  });

  it("still averages when a real group config legitimately scores 0 (regression for fix #3)", () => {
    // Supervisor has a valid group config (center1 present), but the center is
    // weighted at 0 hours, so the group score is genuinely 0. The OLD behavior
    // (`groupScore > 0`) would have skipped averaging and paid full personal —
    // roughly double. The fix conditions on the PRESENCE of the group config
    // (hasGroup = center1 set), so we must still average.
    const rows = [ROW({ Instructor: "SUP [BK]", Center: "Berkeley" })];
    const out = computeCoach({
      accounts: ["SUP [BK]"],
      rows,
      config: makeConfig(),
      inputs: baseInputs({
        position: "Pool Supervisor",
        groupConfig: { center1: "Berkeley", hours1: 0 },
      }),
    });

    expect(out.groupScore).toBe(0);
    // averaged: (personal + 0) / 2 = personal / 2, NOT the full personal score.
    expect(out.finalScore).toBeCloseTo(out.personalScore / 2, 9);
    expect(out.finalScore).not.toBe(out.personalScore);
    expect(out.payout).toBeCloseTo(out.finalScore * 1000, 6);
  });
});

describe("computeCoach — readiness / missing inputs", () => {
  it("flags a missing teaching allowance", () => {
    const out = computeCoach({
      accounts: ["COBYS [BK]"],
      rows: [ROW()],
      config: makeConfig(),
      inputs: baseInputs({ teachingAllowance: null }),
    });
    expect(out.isComplete).toBe(false);
    expect(out.missing).toContain("teaching allowance");
    expect(out.payout).toBe(0); // 0 allowance -> 0 payout
  });

  it("flags a missing management assessment when that metric is enabled", () => {
    const out = computeCoach({
      accounts: ["COBYS [BK]"],
      rows: [ROW()],
      config: makeConfig(), // management_assessment is enabled by default
      inputs: baseInputs({ mgmtAssessment: null }),
    });
    expect(out.isComplete).toBe(false);
    expect(out.missing).toContain("management assessment");
  });

  it("flags missing group/center hours for a supervisor without a group config", () => {
    const out = computeCoach({
      accounts: ["COBYS [BK]"],
      rows: [ROW()],
      config: makeConfig(),
      inputs: baseInputs({ position: "Pool Supervisor", groupConfig: null }),
    });
    expect(out.isComplete).toBe(false);
    expect(out.missing).toContain("group/center hours");
    // no group config -> not a supervisor average; finalScore stays personal.
    expect(out.finalScore).toBe(out.personalScore);
  });
});
