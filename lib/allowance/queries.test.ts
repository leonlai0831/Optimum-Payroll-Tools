import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import type { AllowanceResult } from "./types";

const perfect: AllowanceResult = {
  attendancePct: 1,
  attendance: 500,
  teaching: 300,
  other: 0,
  grandTotal: 800,
};

describe("Allowance DB layer (PGlite in-memory)", () => {
  let queries: typeof import("../db/queries");

  beforeAll(async () => {
    queries = await import("../db/queries");
  });

  it("seeds default allowance config and round-trips edits", async () => {
    const cfg = await queries.getAllowanceConfig();
    expect(cfg.attendance.I3.perfect).toBe(500);
    expect(cfg.attendance.A1.met).toBe(200);
    expect(cfg.teaching.A1.normal).toBe(0);
    expect(cfg.teaching.I3.precompLifesaving).toBe(21);

    const edited = structuredClone(cfg);
    edited.teaching.I3.normal = 99;
    await queries.saveAllowanceConfig(edited);
    expect((await queries.getAllowanceConfig()).teaching.I3.normal).toBe(99);
  });

  it("creates a run, creates/links a coach (remembering the tier), and lists by period", async () => {
    const id = await queries.createAllowanceRun({
      periodLabel: "2026-05",
      input: {
        coachId: null,
        name: "JANE TAN",
        tier: "I3",
        center: "HQ",
        opHours: 160,
        leaveHours: 0,
        teachingRows: [{ center: "HQ", normalH: 10, ysH: 5, precompH: 0 }],
        otherItems: [],
      },
      result: perfect,
      configSnapshot: await queries.getAllowanceConfig(),
    });
    expect(id).toBeGreaterThan(0);

    const list = await queries.listAllowanceRuns("2026-05");
    expect(list.length).toBe(1);
    expect(list[0].canonicalName).toBe("JANE TAN");
    expect(list[0].teaching).toBe(300);
    expect(list[0].coachId).not.toBeNull();

    const coaches = await queries.listCoaches();
    const jane = coaches.find((c) => c.canonicalName === "JANE TAN");
    expect(jane?.allowanceTier).toBe("I3");
  });

  it("replaces an existing record for the same coach + period (upsert)", async () => {
    const cfg = await queries.getAllowanceConfig();
    const base = {
      periodLabel: "2026-06",
      input: {
        coachId: null,
        name: "SAM LEE",
        tier: "T1" as const,
        center: "PJ",
        opHours: 100,
        leaveHours: 0,
        teachingRows: [],
        otherItems: [],
      },
      configSnapshot: cfg,
    };
    await queries.createAllowanceRun({
      ...base,
      result: { attendancePct: 1, attendance: 300, teaching: 0, other: 0, grandTotal: 300 },
    });
    await queries.createAllowanceRun({
      ...base,
      result: { attendancePct: 1, attendance: 300, teaching: 120, other: 0, grandTotal: 420 },
    });

    const list = await queries.listAllowanceRuns("2026-06");
    expect(list.length).toBe(1); // replaced, not duplicated
    expect(list[0].teaching).toBe(120);
  });

  it("saveAllowanceRates preserves the centers list even when the payload clears them", async () => {
    await queries.saveCenters(["HQ", "BK", "PJ"]);
    const before = await queries.getAllowanceConfig();
    // A rates save that arrives with empty centers must NOT wipe the stored list.
    await queries.saveAllowanceRates({ ...before, centers: [] });
    expect((await queries.getAllowanceConfig()).centers).toEqual(["HQ", "BK", "PJ"]);
  });

  it("saveCenters trims/dedupes and leaves the rate tables alone", async () => {
    const before = await queries.getAllowanceConfig();
    // Mutate a rate value so we can prove a centers save doesn't disturb it.
    await queries.saveAllowanceConfig({
      ...before,
      attendance: { ...before.attendance, T0: { met: 999, perfect: 999 } },
    });
    await queries.saveCenters(["A", " B ", "B", ""]);
    const after = await queries.getAllowanceConfig();
    expect(after.centers).toEqual(["A", "B"]);
    expect(after.attendance.T0).toEqual({ met: 999, perfect: 999 });
  });

  it("locks and unlocks a period (idempotent, membership checks)", async () => {
    expect(await queries.isPeriodLocked("2026-08")).toBe(false);

    await queries.lockPeriod("2026-08", "boss@opt.page");
    expect(await queries.isPeriodLocked("2026-08")).toBe(true);
    expect(await queries.getLockedPeriods()).toContain("2026-08");

    // Re-locking is idempotent (no duplicate-key error, refreshes who/when).
    await queries.lockPeriod("2026-08", "boss2@opt.page");
    const locks = await queries.listAllowanceLocks();
    expect(locks.filter((l) => l.periodLabel === "2026-08").length).toBe(1);
    expect(locks.find((l) => l.periodLabel === "2026-08")?.lockedBy).toBe("boss2@opt.page");

    await queries.unlockPeriod("2026-08");
    expect(await queries.isPeriodLocked("2026-08")).toBe(false);
    // Unlocking again is a harmless no-op.
    await queries.unlockPeriod("2026-08");
    expect(await queries.isPeriodLocked("2026-08")).toBe(false);
  });

  it("builds allowance trend data; center slices sum back to the staff total", async () => {
    const cfg = await queries.getAllowanceConfig();
    // A two-center month: teaching split across HQ and BK.
    await queries.createAllowanceRun({
      periodLabel: "2026-09",
      input: {
        coachId: null,
        name: "MULTI MIA",
        tier: "T2",
        center: "HQ, BK",
        opHours: 160,
        leaveHours: 0,
        teachingRows: [
          { center: "HQ", normalH: 10, ysH: 0, precompH: 0 },
          { center: "BK", normalH: 30, ysH: 0, precompH: 0 },
        ],
        otherItems: [],
      },
      result: { attendancePct: 1, attendance: 300, teaching: 200, other: 0, grandTotal: 500 },
      configSnapshot: cfg,
    });

    const trend = await queries.getAllowanceTrendData();
    expect(trend.periods).toContain("2026-09");

    const mia = trend.byStaff.find((s) => s.name === "MULTI MIA");
    expect(mia?.points.find((p) => p.period === "2026-09")?.total).toBe(500);

    const hq = trend.byCenter
      .find((c) => c.name === "HQ")
      ?.points.find((p) => p.period === "2026-09")?.total;
    const bk = trend.byCenter
      .find((c) => c.name === "BK")
      ?.points.find((p) => p.period === "2026-09")?.total;
    // Teaching 200 split 10:30 → HQ 50, BK 150; attendance 300 split evenly → +150 each.
    expect(hq).toBe(200);
    expect(bk).toBe(300);
    expect((hq ?? 0) + (bk ?? 0)).toBe(500); // slices reconcile to the staff total
  });

  it("gets and deletes a saved allowance", async () => {
    const cfg = await queries.getAllowanceConfig();
    const id = await queries.createAllowanceRun({
      periodLabel: "2026-07",
      input: {
        coachId: null,
        name: "DEL ME",
        tier: "T2",
        center: "QSM",
        opHours: 80,
        leaveHours: 0,
        teachingRows: [],
        otherItems: [],
      },
      result: { attendancePct: 1, attendance: 300, teaching: 0, other: 0, grandTotal: 300 },
      configSnapshot: cfg,
    });
    expect((await queries.getAllowanceRun(id))?.canonicalName).toBe("DEL ME");
    await queries.deleteAllowanceRun(id);
    expect(await queries.getAllowanceRun(id)).toBeUndefined();
  });

  it("sequential-month guard: blocks a new month until the previous one has entries", async () => {
    // 2026-06 already has SAM LEE → adding/editing within it is always allowed.
    expect((await queries.checkAllowancePeriodAllowed("2026-06")).allowed).toBe(true);
    // 2026-10 is new, but its predecessor 2026-09 has MULTI MIA → allowed.
    expect((await queries.checkAllowancePeriodAllowed("2026-10")).allowed).toBe(true);
    // 2026-12 is new and 2026-11 is empty (other data exists) → blocked.
    const blocked = await queries.checkAllowancePeriodAllowed("2026-12");
    expect(blocked.allowed).toBe(false);
    expect(blocked.previousPeriod).toBe("2026-11");
  });

  const mk = (periodLabel: string, name: string) =>
    queries
      .getAllowanceConfig()
      .then((configSnapshot) =>
        queries.createAllowanceRun({
          periodLabel,
          input: {
            coachId: null,
            name,
            tier: "I3",
            center: "HQ",
            opHours: 160,
            leaveHours: 0,
            teachingRows: [],
            otherItems: [],
          },
          result: perfect,
          configSnapshot,
        }),
      );

  it("blocks a whole-month move when any staff clashes, and changes nothing", async () => {
    await mk("2030-01", "ALICE");
    await mk("2030-01", "BOB");
    await mk("2030-02", "BOB"); // clashes with the move
    await mk("2030-02", "CAROL");

    expect(await queries.getAllowancePeriodClashes("2030-01", "2030-02")).toEqual(["BOB"]);

    const res = await queries.moveAllowancePeriod("2030-01", "2030-02");
    expect(res).toEqual({ moved: 0, clashes: ["BOB"] }); // all-or-nothing: nothing moved

    // Both months are untouched.
    expect((await queries.listAllowanceRuns("2030-01")).map((r) => r.canonicalName).sort()).toEqual([
      "ALICE",
      "BOB",
    ]);
    expect((await queries.listAllowanceRuns("2030-02")).map((r) => r.canonicalName).sort()).toEqual([
      "BOB",
      "CAROL",
    ]);
  });

  it("moves a whole month with no clashes (here, into an empty target)", async () => {
    await mk("2030-03", "DAVE");
    const res = await queries.moveAllowancePeriod("2030-03", "2030-04");
    expect(res).toEqual({ moved: 1, clashes: [] });
    expect((await queries.listAllowanceRuns("2030-03")).length).toBe(0);
    expect((await queries.listAllowanceRuns("2030-04")).map((r) => r.canonicalName)).toEqual(["DAVE"]);
  });

  it("changes one entry's month, and refuses when the target already has that person", async () => {
    const eveId = await mk("2031-01", "EVE");
    const ok = await queries.moveAllowanceRun(eveId, "2031-02");
    expect(ok.ok).toBe(true);
    expect((await queries.listAllowanceRuns("2031-01")).length).toBe(0);
    expect((await queries.listAllowanceRuns("2031-02")).map((r) => r.canonicalName)).toEqual(["EVE"]);

    const eve3 = await mk("2031-03", "EVE"); // EVE now in 2031-02 and 2031-03
    const clash = await queries.moveAllowanceRun(eve3, "2031-02");
    expect(clash.ok).toBe(false);
    expect((await queries.listAllowanceRuns("2031-03")).map((r) => r.canonicalName)).toEqual(["EVE"]);
  });
});
