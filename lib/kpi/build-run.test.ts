import { describe, expect, it } from "vitest";
import { accountsForMatch, buildRunCoaches, type BuildRunCoachProfile } from "./build-run";
import { computeCoach } from "./coach";
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

const profile = (over: Partial<BuildRunCoachProfile> = {}): BuildRunCoachProfile => ({
  id: 1,
  canonicalName: "COBYS",
  aliases: ["COBYS [BK]"],
  defaultPosition: "Instructor",
  lastAllowance: 1000,
  lastMgmtAssessment: 85,
  ...over,
});

describe("buildRunCoaches", () => {
  it("matches computeCoach for a single carried-over coach (server == client engine)", () => {
    const rows = [ROW()];
    const config = makeConfig();
    const out = buildRunCoaches({ rows, config, coaches: [profile()] });

    expect(out).toHaveLength(1);
    const rc = out[0];
    // Carried over from the profile, linked by alias.
    expect(rc.coachId).toBe(1);
    expect(rc.canonicalName).toBe("COBYS");
    expect(rc.teachingAllowance).toBe(1000);
    expect(rc.mgmtAssessment).toBe(85);
    expect(rc.isComplete).toBe(true);

    // Scores are bit-identical to the pure engine the client uses.
    const ref = computeCoach({
      accounts: ["COBYS [BK]"],
      rows,
      config,
      inputs: { position: "Instructor", teachingAllowance: 1000, mgmtAssessment: 85, groupConfig: null },
    });
    expect(rc.finalScore).toBe(ref.finalScore);
    expect(rc.payout).toBeCloseTo(ref.finalScore * 1000, 9);
    expect(rc.finalScore).toBeCloseTo(0.9354, 3); // the v11.1 golden score
  });

  it("merges branch accounts of one coach and aggregates their rows", () => {
    const rows = [
      ROW({ Instructor: "COBYS [BK]", Center: "Berkeley", TotalStudent: 100 }),
      ROW({ Instructor: "COBYS [PK]", Center: "Puchong Kinrara", TotalStudent: 60 }),
    ];
    const out = buildRunCoaches({ rows, config: makeConfig(), coaches: [profile({ aliases: ["COBYS [BK]", "COBYS [PK]"] })] });
    expect(out).toHaveLength(1);
    expect(out[0].accounts.sort()).toEqual(["COBYS [BK]", "COBYS [PK]"]);
    expect(out[0].students).toBe(160);
  });

  it("produces a reviewable draft: an unknown coach with no allowance is dropped (ghost)", () => {
    // No matching profile -> no carry-over allowance -> appearsInLeaderboard is false.
    const rows = [ROW({ Instructor: "NEWBIE [BK]" })];
    const out = buildRunCoaches({ rows, config: makeConfig(), coaches: [] });
    expect(out).toHaveLength(0);
  });

  it("keeps a coach whose management assessment is missing as incomplete (stays a draft)", () => {
    const rows = [ROW()];
    const out = buildRunCoaches({
      rows,
      config: makeConfig(),
      coaches: [profile({ lastMgmtAssessment: null })],
    });
    expect(out).toHaveLength(1);
    expect(out[0].isComplete).toBe(false);
  });

  it("uses the period Allowance run (over carry-over) + latest assessment", () => {
    const rows = [ROW()];
    const out = buildRunCoaches({
      rows,
      config: makeConfig(),
      coaches: [profile({ lastAllowance: 500, lastMgmtAssessment: 70 })],
      // Linked by coachId — the saved allowance wins over the profile carry-over.
      allowanceRecs: [{ coachId: 1, canonicalName: "COBYS", teaching: 1200 }],
      assessmentByCoachId: { 1: 90 },
    });
    expect(out[0].teachingAllowance).toBe(1200);
    expect(out[0].mgmtAssessment).toBe(90);
  });

  it("links the period allowance by name when the group has no coachId", () => {
    const rows = [ROW({ Instructor: "NEWBIE [BK]" })];
    // No coach profile (so no carry-over, no coachId), but an allowance record
    // exists under the same base name — it should link by normalized name.
    const out = buildRunCoaches({
      rows,
      config: makeConfig(),
      coaches: [],
      allowanceRecs: [{ coachId: null, canonicalName: "NEWBIE", teaching: 900 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].teachingAllowance).toBe(900);
  });

  it("falls back to the profile carry-over when no allowance record links", () => {
    const rows = [ROW()];
    const out = buildRunCoaches({
      rows,
      config: makeConfig(),
      coaches: [profile({ lastAllowance: 777 })],
      allowanceRecs: [{ coachId: 99, canonicalName: "SOMEONE ELSE", teaching: 1200 }],
    });
    expect(out[0].teachingAllowance).toBe(777);
  });

  it("ranks by finalScore desc with a deterministic name tie-break", () => {
    const rows = [
      ROW({ Instructor: "A [BK]", TotalStudent: 280, LevelUp: 40 }),
      ROW({ Instructor: "B [BK]", TotalStudent: 80, LevelUp: 1 }),
    ];
    const coaches = [
      profile({ id: 1, canonicalName: "A", aliases: ["A [BK]"] }),
      profile({ id: 2, canonicalName: "B", aliases: ["B [BK]"] }),
    ];
    const out = buildRunCoaches({ rows, config: makeConfig(), coaches });
    expect(out.map((c) => c.canonicalName)).toEqual(["A", "B"]);
    expect(out[0].finalScore).toBeGreaterThanOrEqual(out[1].finalScore);
  });
});

describe("accountsForMatch", () => {
  it("summarizes each distinct account by first center + total students", () => {
    const rows = [
      ROW({ Instructor: "X [BK]", Center: "Berkeley", TotalStudent: 10 }),
      ROW({ Instructor: "X [BK]", Center: "Berkeley", TotalStudent: 5 }),
      ROW({ Instructor: "Y [PK]", Center: "Puchong Kinrara", TotalStudent: 7 }),
    ];
    expect(accountsForMatch(rows)).toEqual([
      { name: "X [BK]", center: "Berkeley", students: 15 },
      { name: "Y [PK]", center: "Puchong Kinrara", students: 7 },
    ]);
  });
});
