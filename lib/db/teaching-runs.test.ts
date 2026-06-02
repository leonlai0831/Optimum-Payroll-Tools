import { beforeAll, describe, expect, it } from "vitest";
import { computeTeaching } from "@/lib/teaching/calc";
import { DEFAULT_TEACHING_CONFIG } from "@/lib/teaching/defaults";
import type { TeachingRow } from "@/lib/teaching/types";

// In-memory PGlite (no POSTGRES_URL, no on-disk dev DB) — same as audit.test.ts.
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URL;

function row(p: Partial<TeachingRow> & { className: string; staffName: string }): TeachingRow {
  return {
    sessionStart: p.sessionStart ?? "2026-05-01 10:00",
    sessionEnd: p.sessionEnd ?? "2026-05-01 10:45",
    className: p.className,
    staffName: p.staffName,
    userName: p.userName ?? "",
    userEmail: p.userEmail ?? "",
    userPhone: p.userPhone ?? "",
    paidAt: p.paidAt ?? "",
  };
}

// May: Alpha 1 PT attendee (RM 30) + Beta 1 group session (RM 75) → total 105.
const MAY_ROWS: TeachingRow[] = [
  row({ className: "Fitness Appointment Classes", staffName: "Alpha", userName: "X" }),
  row({ className: "Strength and Sweat", staffName: "Beta", userName: "P" }),
];
// Jun: Alpha 2 PT attendees, same slot (RM 60) → total 60, one coach.
const JUN_ROWS: TeachingRow[] = [
  row({ className: "Fitness Appointment Classes", staffName: "Alpha", sessionStart: "2026-06-02 10:00", sessionEnd: "2026-06-02 10:45", userName: "X" }),
  row({ className: "Fitness Appointment Classes", staffName: "Alpha", sessionStart: "2026-06-02 10:00", sessionEnd: "2026-06-02 10:45", userName: "Y" }),
];

const maySummary = computeTeaching(MAY_ROWS, DEFAULT_TEACHING_CONFIG);
const junSummary = computeTeaching(JUN_ROWS, DEFAULT_TEACHING_CONFIG);

describe("teaching run queries (PGlite in-memory)", () => {
  let q: typeof import("./queries");

  beforeAll(async () => {
    q = await import("./queries");
  });

  it("saves a month, then lists it (newest-first) with computed totals", async () => {
    await q.createTeachingRun({
      periodLabel: "May 2026",
      filename: "may.csv",
      sessionRows: MAY_ROWS,
      configSnapshot: DEFAULT_TEACHING_CONFIG,
      summary: maySummary,
    });
    await q.createTeachingRun({
      periodLabel: "Jun 2026",
      filename: "jun.csv",
      sessionRows: JUN_ROWS,
      configSnapshot: DEFAULT_TEACHING_CONFIG,
      summary: junSummary,
    });

    const list = await q.listTeachingRuns();
    expect(list.map((r) => r.periodLabel)).toEqual(["Jun 2026", "May 2026"]); // newest first
    const may = list.find((r) => r.periodLabel === "May 2026")!;
    expect(may.coachCount).toBe(2);
    expect(may.totalIncome).toBe(maySummary.totals.totalIncome); // 105
    expect(may.ptIncome).toBe(30);
    expect(may.groupIncome).toBe(75);
  });

  it("getTeachingRun returns the full snapshot (rows + config + summary)", async () => {
    const list = await q.listTeachingRuns();
    const id = list.find((r) => r.periodLabel === "Jun 2026")!.id;
    const run = await q.getTeachingRun(id);
    expect(run?.sessionRows).toHaveLength(2);
    expect(run?.configSnapshot.ptRate).toBe(DEFAULT_TEACHING_CONFIG.ptRate);
    expect(run?.summary.totals.totalIncome).toBe(60);
  });

  it("getTeachingTrendData aggregates company totals + per-coach points across months", async () => {
    const trend = await q.getTeachingTrendData();
    expect(trend.periods).toEqual(["May 2026", "Jun 2026"]); // ascending by save time
    expect(trend.totals.find((t) => t.period === "May 2026")!.totalIncome).toBe(105);
    expect(trend.totals.find((t) => t.period === "Jun 2026")!.totalIncome).toBe(60);

    const alpha = trend.coaches.find((c) => c.name === "Alpha")!;
    expect(alpha.points.map((p) => p.period)).toEqual(["May 2026", "Jun 2026"]);
    const beta = trend.coaches.find((c) => c.name === "Beta")!;
    expect(beta.points.map((p) => p.period)).toEqual(["May 2026"]); // only in May
  });

  it("a later save of the same period wins in the trend, and delete removes the month", async () => {
    // Re-save "May 2026" with the Jun figures (total 60) — latest save should win.
    await q.createTeachingRun({
      periodLabel: "May 2026",
      filename: "may-v2.csv",
      sessionRows: JUN_ROWS,
      configSnapshot: DEFAULT_TEACHING_CONFIG,
      summary: junSummary,
    });
    const trend = await q.getTeachingTrendData();
    expect(trend.totals.find((t) => t.period === "May 2026")!.totalIncome).toBe(60);

    const jun = (await q.listTeachingRuns()).find((r) => r.periodLabel === "Jun 2026")!;
    await q.deleteTeachingRun(jun.id);
    expect((await q.listTeachingRuns()).some((r) => r.id === jun.id)).toBe(false);
  });
});
