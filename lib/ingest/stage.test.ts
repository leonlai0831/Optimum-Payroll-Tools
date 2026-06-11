import { beforeAll, describe, expect, it } from "vitest";

// Use an in-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB) —
// set BEFORE the helper (and its db import chain) loads. Mirrors lib/db/ingest.test.ts.
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

/** Raw rows exactly as either door receives them — flexible legacy headers. */
function rawRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tr_name: "COBYS [BK]",
    cr_name: "Berkeley",
    "TTL-LVL": 152,
    "TTL-COLOR": 38,
    Black: 5,
    UP: 9,
    STUDENT_STOP: 2,
    STUDENT_ATTENDED_CLASS: 580,
    ...over,
  };
}

/**
 * The shared staging helper behind BOTH doors — the bearer machine push
 * (/api/ingest/kpi) and the logged-in manual upload (/api/progress/uploads).
 * One behavior: normalize → stage pending → supersede still-pending same-period
 * deliveries → audit; closed periods 409 before anything is written.
 */
describe("stageKpiDelivery (PGlite in-memory)", () => {
  let stage: typeof import("./stage");
  let queries: typeof import("@/lib/db/queries");

  beforeAll(async () => {
    stage = await import("./stage");
    queries = await import("@/lib/db/queries");
  });

  it("push → supersede → 409-closed, one continuous lifecycle", async () => {
    // 1. First push stages a pending delivery with normalized rows.
    const first = await stage.stageKpiDelivery({
      periodLabel: "2026-05",
      label: "may-v1",
      rawRows: [rawRow()],
      source: "api",
    });
    if (!first.ok) throw new Error(first.error);
    expect(first).toMatchObject({ ok: true, rows: 1, superseded: 0 });
    const stored = await queries.getKpiIngest(first.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.source).toBe("api");
    expect(stored?.rows[0]).toMatchObject({
      Instructor: "COBYS [BK]",
      Center: "Berkeley",
      TotalStudent: 152,
      TotalColor: 38,
      LevelUp: 9,
      Stop: 2,
      Attended: 580,
    });

    // 2. A re-stage for the same period supersedes the still-pending delivery —
    //    regardless of which door it comes through (manual here, api before).
    const second = await stage.stageKpiDelivery({
      periodLabel: "2026-05",
      label: "may-v2.csv",
      rawRows: [rawRow({ "TTL-LVL": 160 })],
      source: "manual",
      actor: { id: 7, email: "leon@optimum.test" },
    });
    if (!second.ok) throw new Error(second.error);
    expect(second.superseded).toBe(1);
    expect((await queries.getKpiIngest(first.id))?.status).toBe("superseded");
    expect((await queries.getKpiIngest(second.id))?.status).toBe("pending");
    expect((await queries.getKpiIngest(second.id))?.source).toBe("manual");

    // 3. Import the survivor → the period is CLOSED: a third stage is rejected
    //    with 409 and writes nothing (no new delivery, no supersede, no audit).
    const runId = await queries.createRun({
      periodLabel: "2026-05",
      filename: "may.csv",
      csvRows: (await queries.getKpiIngest(second.id))!.rows,
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
      status: "draft", // closure comes from the imported delivery alone
    });
    expect(await queries.importKpiIngest(second.id, runId)).toBe(true);

    const auditCountBefore = (await queries.listAuditLog()).length;
    const rejected = await stage.stageKpiDelivery({
      periodLabel: "2026-05",
      label: "may-v3",
      rawRows: [rawRow()],
      source: "api",
    });
    expect(rejected).toEqual({
      ok: false,
      status: 409,
      error:
        "2026-05 is already finalized — ask the payroll admin to reopen it if a correction is needed.",
    });
    const forPeriod = (await queries.listKpiIngests()).filter((i) => i.periodLabel === "2026-05");
    expect(forPeriod.map((i) => ({ id: i.id, status: i.status }))).toEqual([
      { id: second.id, status: "imported" },
      { id: first.id, status: "superseded" },
    ]);
    expect((await queries.listAuditLog()).length).toBe(auditCountBefore);
  });

  it("audits received + superseded, attributing the actor (manual) or ingest-api (machine)", async () => {
    const api = await stage.stageKpiDelivery({
      periodLabel: "2026-07",
      label: "july-v1",
      rawRows: [rawRow()],
      source: "api",
    });
    if (!api.ok) throw new Error(api.error);
    const manual = await stage.stageKpiDelivery({
      periodLabel: "2026-07",
      label: "july-v2.csv",
      rawRows: [rawRow()],
      source: "manual",
      actor: { id: 7, email: "leon@optimum.test" },
    });
    if (!manual.ok) throw new Error(manual.error);

    const audits = await queries.listAuditLog();
    const received = audits.filter(
      (a) => a.action === "kpi_ingest.received" && a.summary.includes("2026-07"),
    );
    expect(received.map((a) => a.actorEmail).sort()).toEqual(["ingest-api", "leon@optimum.test"]);
    expect(received.find((a) => a.entityId === String(manual.id))?.summary).toContain(
      "manual upload",
    );
    const superseded = audits.find(
      (a) => a.action === "kpi_ingest.superseded" && a.entityId === String(api.id),
    );
    expect(superseded?.actorEmail).toBe("leon@optimum.test");
    expect(superseded?.summary).toContain(`#${manual.id}`);
  });

  it("rejects rows with no resolvable instructor column (400) without staging anything", async () => {
    const res = await stage.stageKpiDelivery({
      periodLabel: "2026-08",
      label: "",
      rawRows: [{ foo: 1, bar: 2 }],
      source: "manual",
      actor: { id: 7, email: "leon@optimum.test" },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.status).toBe(400);
    expect(res.error).toMatch(/No instructor column found/);
    expect((await queries.listKpiIngests()).some((i) => i.periodLabel === "2026-08")).toBe(false);
  });
});
