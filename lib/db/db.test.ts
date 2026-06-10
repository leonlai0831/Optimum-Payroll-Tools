import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
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

  it("reopenRun reverts a finalized month to an editable draft (no-op on a draft)", async () => {
    const finalId = await queries.createRun({
      periodLabel: "2026-09",
      filename: "sep.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [makeCoach("REOPEN RON", { isComplete: true, mgmtAssessment: 90 })],
      status: "finalized",
    });
    expect((await queries.listRuns()).find((r) => r.id === finalId)?.status).toBe("finalized");

    // Reopen flips it back to draft so the review screen becomes editable again.
    expect(await queries.reopenRun(finalId)).toBe(true);
    expect((await queries.listRuns()).find((r) => r.id === finalId)?.status).toBe("draft");
    // Coach results are preserved through the reopen.
    expect((await queries.getRun(finalId))?.coachResults[0]?.canonicalName).toBe("REOPEN RON");

    // Reopening a run that's already a draft is a no-op (returns false).
    expect(await queries.reopenRun(finalId)).toBe(false);
    expect((await queries.listRuns()).find((r) => r.id === finalId)?.status).toBe("draft");

    // It can be re-finalized after the correction.
    await queries.updateRunReview(
      finalId,
      [makeCoach("REOPEN RON", { isComplete: true, mgmtAssessment: 95 })],
      "finalized",
    );
    expect((await queries.listRuns()).find((r) => r.id === finalId)?.status).toBe("finalized");
  });

  it("normalizes raw CSV center names onto configured codes in the coach carry-over", async () => {
    // Settings → Centers: configure USJ with a "Subang USJ" alias.
    await queries.saveCenters(["HQ", "USJ"], { HQ: [], USJ: ["Subang USJ"] });

    await queries.createRun({
      periodLabel: "2027-04",
      filename: "apr.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [makeCoach("CENTER CARL", { center: "Subang USJ" })],
    });
    const carl = (await queries.listCoaches()).find((c) => c.canonicalName === "CENTER CARL")!;
    expect(carl.center).toBe("USJ"); // alias → code, not the raw CSV spelling

    // An unconfigured value passes through untouched (never silently dropped).
    await queries.upsertCoachesFromRun([makeCoach("CENTER CARA", { center: "Mystery Pool" })]);
    const cara = (await queries.listCoaches()).find((c) => c.canonicalName === "CENTER CARA")!;
    expect(cara.center).toBe("Mystery Pool");
  });

  it("dedupes a twice-saved month in trends and the coach profile (latest save wins)", async () => {
    // The same period label saved twice (e.g. a retry, or a corrected re-upload).
    await queries.createRun({
      periodLabel: "2027-03",
      filename: "mar-v1.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [makeCoach("TWICE TINA", { finalScore: 1, payout: 1000 })],
    });
    await queries.createRun({
      periodLabel: "2027-03",
      filename: "mar-v2.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [makeCoach("TWICE TINA", { finalScore: 1.2, payout: 1200 })],
    });

    // Trends: exactly ONE point for the period, from the latest save.
    const trend = await queries.getTrendData();
    expect(trend.periods.filter((p) => p === "2027-03")).toHaveLength(1);
    const tina = trend.coaches.find((c) => c.name === "TWICE TINA")!;
    const points = tina.points.filter((p) => p.period === "2027-03");
    expect(points).toHaveLength(1);
    expect(points[0].payout).toBe(1200);

    // Coach profile: same dedup, latest save wins.
    const coach = (await queries.listCoaches()).find((c) => c.canonicalName === "TWICE TINA")!;
    const profile = await queries.getCoachProfile(coach.id);
    const kpiPoints = profile!.kpi.filter((p) => p.period === "2027-03");
    expect(kpiPoints).toHaveLength(1);
    expect(kpiPoints[0].payout).toBe(1200);
    expect(kpiPoints[0].finalScore).toBe(1.2);
  });

  it("mergeCoaches: folds a CSV-created duplicate into the real profile (the ARIF case)", async () => {
    // The real person, created from the staff side with the full name.
    const farhan = await queries.createCoach({ canonicalName: "ARIF FARHAN", center: "PK" });
    // A KPI upload auto-created a duplicate under the cleaned CSV name, with a month of history.
    await queries.createRun({
      periodLabel: "2027-05",
      filename: "may.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [
        makeCoach("ARIF", {
          accounts: ["ARIF - LMY [PK]"],
          center: "PK",
          teachingAllowance: 900,
          payout: 900,
        }),
      ],
    });
    const dup = (await queries.listCoaches()).find((c) => c.canonicalName === "ARIF")!;

    // Dependents on the duplicate: an allowance month, an assessment, and a login.
    const cfg = await queries.getAllowanceConfig();
    const { calcAllowance } = await import("../allowance/calc");
    const input = {
      coachId: dup.id,
      name: "ARIF",
      tier: "T3" as const,
      center: "PK",
      opHours: 160,
      leaveHours: 0,
      teachingRows: [{ center: "PK", normalH: 8, ysH: 0, precompH: 0 }],
      otherItems: [],
    };
    await queries.createAllowanceRunIfUnlocked({
      periodLabel: "2027-05",
      input,
      result: calcAllowance(input, cfg),
      configSnapshot: cfg,
    });
    await queries.createAssessment({
      coachId: dup.id,
      observedOn: new Date(),
      assessor: "QA",
      classType: "LTS",
      poolType: "Indoor",
      pax: 4,
      levels: [],
      hasHelper: false,
      ratings: {},
      totalPercent: 80,
      finalGrade: "B" as Parameters<typeof queries.createAssessment>[0]["finalGrade"],
      comments: "",
    });
    const login = await queries.createUser({
      email: "arif@opt.page",
      password: "pw",
      role: "staff",
      coachId: dup.id,
    });

    const result = await queries.mergeCoaches(farhan.id, dup.id);
    expect(result.duplicateName).toBe("ARIF");
    expect(result.movedAllowanceRuns).toBe(1);
    expect(result.conflictingPeriods).toEqual([]);

    // The duplicate is gone; its identity is now an alias of the survivor.
    const all = await queries.listCoaches();
    expect(all.some((c) => c.canonicalName === "ARIF")).toBe(false);
    const survivor = all.find((c) => c.canonicalName === "ARIF FARHAN")!;
    expect(survivor.aliases).toContain("ARIF");
    expect(survivor.aliases).toContain("ARIF - LMY [PK]");
    expect(survivor.allowanceTier).toBe("T3"); // carried over from the duplicate

    // Allowance history renamed + re-pointed, including the snapshot input's name.
    const runsFor = await queries.listAllowanceRuns("2027-05");
    const moved = runsFor.find((r) => r.coachId === farhan.id)!;
    expect(moved.canonicalName).toBe("ARIF FARHAN");
    const inputs = await queries.getAllowanceInputsForPeriod("2027-05");
    expect(inputs.get("ARIF FARHAN")?.name).toBe("ARIF FARHAN");
    expect(inputs.has("ARIF")).toBe(false);

    // Assessment + login follow the survivor.
    expect((await queries.listAssessmentsForCoach(farhan.id)).length).toBe(1);
    expect((await queries.getUserById(login.id))!.coachId).toBe(farhan.id);

    // KPI history follows via the alias set — the saved month shows on the survivor.
    const profile = await queries.getCoachProfile(farhan.id);
    expect(profile!.kpi.some((p) => p.period === "2027-05" && p.payout === 900)).toBe(true);
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

  it("derives the job role from the pay tier on create (A1/A2/A3 → front desk)", async () => {
    const fd = await queries.createCoach({ canonicalName: "FRONT DESK A1", allowanceTier: "A1" });
    expect(fd.jobRole).toBe("front_desk");

    const inst = await queries.createCoach({ canonicalName: "TEACHER T1", allowanceTier: "T1" });
    expect(inst.jobRole).toBe("instructor");

    const noTier = await queries.createCoach({ canonicalName: "NO TIER YET" });
    expect(noTier.jobRole).toBe("instructor");

    // An explicit role always wins over the tier-derived default.
    const override = await queries.createCoach({
      canonicalName: "A1 BUT INSTRUCTOR",
      allowanceTier: "A1",
      jobRole: "instructor",
    });
    expect(override.jobRole).toBe("instructor");
  });

  it("migration 0016 backfills the job role from the pay tier on existing rows", async () => {
    // Seed rows whose role is WRONG for their tier (forced past the create rule).
    await queries.createCoach({ canonicalName: "MIG A2 WRONG", allowanceTier: "A2", jobRole: "instructor" });
    await queries.createCoach({ canonicalName: "MIG T2 WRONG", allowanceTier: "T2", jobRole: "front_desk" });
    await queries.createCoach({ canonicalName: "MIG NONE WRONG", jobRole: "front_desk" });

    // Run the actual migration SQL file (catches typos in the shipped statements).
    const { getDb } = await import("./index");
    const db = await getDb();
    const file = readFileSync("lib/db/migrations/0016_front_desk_tier_rule.sql", "utf8");
    for (const chunk of file.split("--> statement-breakpoint")) {
      const stmt = chunk.replace(/^\s*--.*$/gm, "").trim();
      if (stmt) await db.execute(sql.raw(stmt));
    }

    const byName = Object.fromEntries((await queries.listCoaches()).map((c) => [c.canonicalName, c.jobRole]));
    expect(byName["MIG A2 WRONG"]).toBe("front_desk"); // A2 → front desk
    expect(byName["MIG T2 WRONG"]).toBe("instructor"); // T2 → instructor
    expect(byName["MIG NONE WRONG"]).toBe("instructor"); // no tier → instructor
  });

  it("deep-merges a key missing from a nested config object (shallow spread would miss it)", async () => {
    // Simulate an older stored config: complete at the top level, but missing a
    // key INSIDE a nested object (`centerTargets`) — the case a one-level
    // `{ ...defaults(), ...stored }` spread would silently drop.
    const base = queries.defaultConfig();
    const sampleCenter = Object.keys(base.centerTargets)[0];
    const stored = structuredClone(base);
    delete (stored.centerTargets as Record<string, number>)[sampleCenter];
    // Override another nested value so we can prove stored values still win.
    const keptCenter = Object.keys(stored.centerTargets)[0];
    stored.centerTargets[keptCenter] = 12345;
    await queries.saveConfig(stored);

    const got = await queries.getConfig();
    // The missing nested key is backfilled from defaults…
    expect(got.centerTargets[sampleCenter]).toBe(base.centerTargets[sampleCenter]);
    // …while the stored value for an existing nested key still wins.
    expect(got.centerTargets[keptCenter]).toBe(12345);

    // A config that already has every key round-trips byte-for-byte unchanged.
    const full = queries.defaultConfig();
    await queries.saveConfig(full);
    expect(await queries.getConfig()).toEqual(full);
  });

  it("migration 0023 dedups + repoints coaches and dedups allowance_runs, then makes them unique", async () => {
    const { getDb } = await import("./index");
    const db = await getDb();

    // The unique indexes already exist (the test DB ran every migration on
    // connect), so drop them to seed the duplicates this migration must clean up.
    await db.execute(sql.raw(`DROP INDEX IF EXISTS "coaches_name_idx"`));
    await db.execute(sql.raw(`DROP INDEX IF EXISTS "allowance_runs_period_name_idx"`));

    // Two duplicate "DUP DAN" coach rows + one unique control coach.
    const dan1 = await queries.createCoach({ canonicalName: "DUP DAN" });
    const dan2 = await queries.createCoach({ canonicalName: "DUP DAN" });
    const ctrl = await queries.createCoach({ canonicalName: "SOLO SUE" });
    const survivor = Math.min(dan1.id, dan2.id); // dedup keeps MIN(id)
    const loser = Math.max(dan1.id, dan2.id);

    // References pointing at the LOSER must be repointed to the survivor.
    await db.execute(
      sql.raw(`INSERT INTO "users" (email, password_hash, coach_id) VALUES ('dup@x.io', 'h', ${loser})`),
    );
    await db.execute(
      sql.raw(`INSERT INTO "assessments" (coach_id, total_percent, final_grade) VALUES (${loser}, 80, 'B')`),
    );
    await db.execute(
      sql.raw(`INSERT INTO "notes" (coach_id) VALUES (${loser})`),
    );

    // Two duplicate allowance_runs for the same (period, name); dedup keeps NEWEST.
    // (PGlite's drizzle `execute` returns `{ rows }`; this test only runs there.)
    const insertAr = async (cid: number): Promise<number> => {
      const res = (await db.execute(
        sql.raw(
          `INSERT INTO "allowance_runs" (period_label, coach_id, canonical_name, tier, center, input, result, config_snapshot) ` +
            `VALUES ('2099-01', ${cid}, 'DUP DAN', 'I3', 'HQ', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb) RETURNING id`,
        ),
      )) as unknown as { rows: { id: number }[] };
      return res.rows[0].id;
    };
    const arOldId = await insertAr(loser);
    const arNewId = await insertAr(loser);
    const newestArId = Math.max(arOldId, arNewId);

    // Run the actual shipped migration SQL (catches typos in the statements).
    const file = readFileSync("lib/db/migrations/0023_panoramic_changeling.sql", "utf8");
    for (const chunk of file.split("--> statement-breakpoint")) {
      const stmt = chunk.replace(/^\s*--.*$/gm, "").trim();
      if (stmt) await db.execute(sql.raw(stmt));
    }

    // Exactly one DUP DAN coach remains — the survivor (MIN id).
    const dans = (await queries.listCoaches()).filter((c) => c.canonicalName === "DUP DAN");
    expect(dans.map((c) => c.id)).toEqual([survivor]);
    // The control coach is untouched.
    expect((await queries.listCoaches()).some((c) => c.id === ctrl.id)).toBe(true);

    // Every reference was repointed to the survivor (nothing orphaned at the loser).
    const orphanCounts = await Promise.all(
      ["users", "assessments", "notes"].map(async (t) => {
        const res = (await db.execute(
          sql.raw(`SELECT coach_id FROM "${t}" WHERE coach_id = ${loser}`),
        )) as unknown as { rows: unknown[] };
        return res.rows.length;
      }),
    );
    for (const n of orphanCounts) expect(n).toBe(0);

    // The surviving allowance_runs row is the NEWEST and now points at the survivor coach.
    const ar = (await db.execute(
      sql.raw(`SELECT id, coach_id FROM "allowance_runs" WHERE period_label = '2099-01' AND canonical_name = 'DUP DAN'`),
    )) as unknown as { rows: { id: number; coach_id: number }[] };
    expect(ar.rows.length).toBe(1);
    expect(ar.rows[0].id).toBe(newestArId);
    expect(ar.rows[0].coach_id).toBe(survivor);

    // The unique indexes now exist again — a fresh duplicate is rejected.
    await expect(
      db.execute(sql.raw(`INSERT INTO "coaches" (canonical_name) VALUES ('DUP DAN')`)),
    ).rejects.toThrow();
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
