import { beforeAll, describe, expect, it } from "vitest";
import type { RunCoach } from "../types";

// Use an in-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

/** Minimal RunCoach fixture; override per test. */
function makeCoach(name: string, overrides: Partial<RunCoach> = {}): RunCoach {
  return {
    coachId: null,
    canonicalName: name,
    accounts: [`${name} [BK]`],
    center: "Berkeley",
    position: "Instructor",
    teachingAllowance: 1000,
    mgmtAssessment: 85,
    groupConfig: null,
    students: 100,
    personalScore: 1,
    groupScore: 0,
    finalScore: 1,
    grade: "A",
    payout: 1000,
    breakdown: [],
    isComplete: true,
    ...overrides,
  };
}

describe("DB layer (PGlite in-memory)", () => {
  let queries: typeof import("./queries");

  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("seeds default config and round-trips a saved config", async () => {
    const cfg = await queries.getConfig();
    expect(cfg.personalKpi.length).toBe(6);
    expect(cfg.centerTargets.Berkeley).toBe(450);

    const edited = structuredClone(cfg);
    edited.gradeThresholds.S = 1.3;
    await queries.saveConfig(edited);
    expect((await queries.getConfig()).gradeThresholds.S).toBe(1.3);
  });

  it("creates a run, lists it, and upserts a coach profile", async () => {
    const id = await queries.createRun({
      periodLabel: "2026-04",
      filename: "test.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [
        {
          coachId: null,
          canonicalName: "HONG LI",
          accounts: ["HONG LI [BK]", "HONG LI HARVEST"],
          center: "Berkeley",
          position: "Instructor",
          teachingAllowance: 1200,
          mgmtAssessment: 85,
          groupConfig: null,
          students: 205,
          personalScore: 1.02,
          groupScore: 0,
          finalScore: 1.02,
          grade: "A",
          payout: 1224,
          breakdown: [],
          isComplete: true,
        },
      ],
    });
    expect(id).toBeGreaterThan(0);

    const runsList = await queries.listRuns();
    expect(runsList.length).toBeGreaterThan(0);
    expect(runsList[0].totalPayout).toBe(1224);

    const known = await queries.getKnownCoaches();
    const hongli = known.find((c) => c.canonicalName === "HONG LI");
    expect(hongli?.aliases).toContain("HONG LI HARVEST");
  });

  it("derives draft vs finalized from coach completeness", () => {
    expect(queries.runStatusFromResults([])).toBe("draft");
    expect(queries.runStatusFromResults([makeCoach("A")])).toBe("finalized");
    expect(
      queries.runStatusFromResults([makeCoach("A"), makeCoach("B", { isComplete: false })]),
    ).toBe("draft");
  });

  it("keeps an incomplete month a draft and carries profiles forward only on finalize", async () => {
    const draftId = await queries.createRun({
      periodLabel: "2026-05",
      filename: "may.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [makeCoach("DRAFT GUY", { isComplete: false, mgmtAssessment: null })],
      status: "draft",
    });
    // A draft does not pollute coach profiles…
    expect((await queries.getKnownCoaches()).some((c) => c.canonicalName === "DRAFT GUY")).toBe(
      false,
    );
    expect((await queries.listRuns()).find((r) => r.id === draftId)?.status).toBe("draft");

    // …until the management review is filled in and the month is finalized.
    await queries.updateRunReview(
      draftId,
      [makeCoach("DRAFT GUY", { isComplete: true, mgmtAssessment: 88 })],
      "finalized",
    );
    expect((await queries.getKnownCoaches()).some((c) => c.canonicalName === "DRAFT GUY")).toBe(
      true,
    );
    expect((await queries.listRuns()).find((r) => r.id === draftId)?.status).toBe("finalized");
  });

  it("backfills finalize_kpi for admin but not supervisor/staff", () => {
    const normalized = queries.normalizePermissionConfig({
      admin: ["run_kpi"],
      supervisor: ["run_kpi"],
      staff: ["view_own"],
    });
    expect(normalized.admin).toContain("finalize_kpi");
    expect(normalized.supervisor).not.toContain("finalize_kpi");
    expect(normalized.staff).not.toContain("finalize_kpi");
  });

  it("lists distinct CSV account names across runs, sorted and trimmed", async () => {
    const row = (Instructor: string) => ({
      Center: "Berkeley",
      Instructor,
      TotalStudent: 10,
      TotalColor: 10,
      Black: 0,
      LevelUp: 0,
      Downgrade: 0,
      Switch: 0,
      Stop: 0,
      Attended: 30,
    });
    await queries.createRun({
      periodLabel: "2026-05",
      filename: "may.csv",
      csvRows: [row("ZOE [BK]"), row("  ARIF FARHAN [PK]  "), row("ZOE [BK]")],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
    });

    const names = await queries.listAllCsvAccountNames();
    // Trimmed, de-duped, A–Z; both this run's names appear once each.
    expect(names).toContain("ARIF FARHAN [PK]");
    expect(names).toContain("ZOE [BK]");
    expect(names.filter((n) => n === "ZOE [BK]")).toHaveLength(1);
    expect(names.indexOf("ARIF FARHAN [PK]")).toBeLessThan(names.indexOf("ZOE [BK]"));
  });

  it("includes coach aliases in account-name suggestions even with no run for them", async () => {
    // Regression: deleting the run that contained an account used to drop it from
    // the suggestions. Coach aliases are a second, run-independent source.
    const coach = await queries.createCoach({ canonicalName: "CHAM TENG HUI" });
    await queries.updateCoachAliases(coach.id, ["CHAM - YL [PJ]"]);

    const names = await queries.listAllCsvAccountNames();
    expect(names).toContain("CHAM - YL [PJ]");
  });

  it("creates, lists (newest first), and deletes gym-staff notes scoped to the member", async () => {
    const aId = await queries.createGymStaff({
      name: "Faisal Ramlee",
      staffCode: "MMH9F737",
      position: "personal_trainer",
      employmentType: "full_time",
      email: "",
      phone: "",
      aliases: [],
      active: true,
    });
    const bId = await queries.createGymStaff({
      name: "Other Coach",
      staffCode: "",
      position: "front_desk",
      employmentType: "part_time",
      email: "",
      phone: "",
      aliases: [],
      active: true,
    });

    await queries.createGymNote({
      gymStaffId: aId,
      noteDate: new Date("2026-01-01"),
      type: "coaching",
      title: "Older",
      body: "",
      severity: null,
      followUp: false,
      authoredBy: "mgr@x.com",
    });
    const recent = await queries.createGymNote({
      gymStaffId: aId,
      noteDate: new Date("2026-05-01"),
      type: "disciplinary",
      title: "Newer",
      body: "late",
      severity: "high",
      followUp: true,
      authoredBy: "mgr@x.com",
    });
    // A note on a different member must not leak into A's timeline.
    await queries.createGymNote({
      gymStaffId: bId,
      noteDate: new Date("2026-06-01"),
      type: "general",
      title: "B note",
      body: "",
      severity: null,
      followUp: false,
      authoredBy: "mgr@x.com",
    });

    const aNotes = await queries.listGymNotes(aId);
    expect(aNotes.map((n) => n.title)).toEqual(["Newer", "Older"]); // newest first
    expect(aNotes[0].severity).toBe("high");

    await queries.deleteGymNote(recent.id);
    const after = await queries.listGymNotes(aId);
    expect(after.map((n) => n.title)).toEqual(["Older"]);
    // B's note untouched.
    expect((await queries.listGymNotes(bId)).map((n) => n.title)).toEqual(["B note"]);
  });
});
