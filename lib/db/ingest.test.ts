import { beforeAll, describe, expect, it } from "vitest";
import { hasInstructorHeader, mapCsvRows } from "../kpi/csv";
import type { InstructorRow } from "../kpi/types";

// Use an in-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

/** A canonical row fixture; override per test. */
function row(over: Partial<InstructorRow> = {}): InstructorRow {
  return {
    Center: "Berkeley",
    Instructor: "HONG LI [BK]",
    TotalStudent: 150,
    TotalColor: 40,
    Black: 4,
    LevelUp: 12,
    Downgrade: 0,
    Switch: 0,
    Stop: 1,
    Attended: 600,
    ...over,
  };
}

describe("KPI ingests (PGlite in-memory)", () => {
  let queries: typeof import("./queries");

  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("normalizes flexibly-headered pushed rows through the CSV mapping and stages them", async () => {
    // The exact alternate headers the legacy export uses — the ingest API must
    // accept the same flexible headers as a file upload.
    const pushed = [
      {
        tr_name: "COBYS [BK]",
        cr_name: "Berkeley",
        "TTL-LVL": 152,
        "TTL-COLOR": 38,
        Black: 5,
        UP: 9,
        STUDENT_STOP: 2,
        STUDENT_ATTENDED_CLASS: 580,
      },
    ];
    expect(hasInstructorHeader(pushed)).toBe(true);
    expect(hasInstructorHeader([{ nobody: 1 }])).toBe(false);

    const rows = mapCsvRows(pushed);
    expect(rows[0]).toMatchObject({
      Instructor: "COBYS [BK]",
      Center: "Berkeley",
      TotalStudent: 152,
      TotalColor: 38,
      Black: 5,
      LevelUp: 9,
      Stop: 2,
      Attended: 580,
    });

    const { id, supersededIds } = await queries.createKpiIngest({
      periodLabel: "2026-05",
      label: "kpi_2026_05.csv",
      rows,
    });
    expect(id).toBeGreaterThan(0);
    expect(supersededIds).toEqual([]); // first push for the period supersedes nothing

    const stored = await queries.getKpiIngest(id);
    expect(stored?.status).toBe("pending");
    expect(stored?.rows).toEqual(rows);

    const listed = (await queries.listKpiIngests()).find((i) => i.id === id)!;
    expect(listed.rowCount).toBe(1);
    expect(listed.label).toBe("kpi_2026_05.csv");
    expect((await queries.listPendingKpiIngests()).some((i) => i.id === id)).toBe(true);
  });

  it("lets the owner edit rows while pending AND after import — only superseded is read-only", async () => {
    const { id } = await queries.createKpiIngest({
      periodLabel: "2026-06",
      label: "june.csv",
      rows: [row()],
    });

    // Edit: fix a value, delete nothing, add a row — the full set is replaced.
    const edited = [row({ TotalStudent: 175 }), row({ Instructor: "NEW GUY [BK]" })];
    expect(await queries.updateKpiIngestRows(id, edited)).toBe(true);
    expect((await queries.getKpiIngest(id))?.rows).toEqual(edited);

    // Import it: the delivery stays correctable as the month's database record
    // (the saved run snapshotted the rows at import time and is NOT affected).
    const runId = await queries.createRun({
      periodLabel: "2026-06",
      filename: "june.csv",
      csvRows: edited,
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
    });
    expect(await queries.importKpiIngest(id, runId)).toBe(true);
    const corrected = [row({ TotalStudent: 999 })];
    expect(await queries.updateKpiIngestRows(id, corrected)).toBe(true);
    const after = await queries.getKpiIngest(id);
    expect(after?.rows).toEqual(corrected);
    // …without disturbing the import linkage.
    expect(after?.status).toBe("imported");
    expect(after?.importedRunId).toBe(runId);
    // The run's snapshot is untouched by the ingest edit.
    expect((await queries.getRun(runId))?.csvRows).toEqual(edited);
  });

  it("import marks status + run linkage, and the rows stay readable forever", async () => {
    const rows = [row({ Instructor: "KEEPER [PK]" })];
    const { id } = await queries.createKpiIngest({ periodLabel: "2026-07", label: "july", rows });
    const runId = await queries.createRun({
      periodLabel: "2026-07",
      filename: "july",
      csvRows: rows,
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
    });

    expect(await queries.importKpiIngest(id, runId)).toBe(true);
    const after = await queries.getKpiIngest(id);
    expect(after?.status).toBe("imported");
    expect(after?.importedRunId).toBe(runId);
    expect(after?.importedAt).not.toBeNull();
    // HARD requirement: the staged delivery remains viewable after import.
    expect(after?.rows).toEqual(rows);
    expect((await queries.listKpiIngests()).some((i) => i.id === id)).toBe(true);

    // A second import (stale/duplicate save) is a silent no-op.
    expect(await queries.importKpiIngest(id, runId + 1)).toBe(false);
    expect((await queries.getKpiIngest(id))?.importedRunId).toBe(runId);
    // …and an id that doesn't exist is ignored too (never breaks the run save).
    expect(await queries.importKpiIngest(999_999, runId)).toBe(false);
  });

  it("discard is a status flip — the delivery stays listed, and only pending can flip", async () => {
    const { id } = await queries.createKpiIngest({
      periodLabel: "2026-08",
      label: "bad-push",
      rows: [row()],
    });
    expect(await queries.discardKpiIngest(id)).toBe(true);

    const after = await queries.getKpiIngest(id);
    expect(after?.status).toBe("discarded");
    expect(after?.rows).toHaveLength(1); // never hard-deleted
    expect((await queries.listKpiIngests()).find((i) => i.id === id)?.status).toBe("discarded");

    // Already discarded → no-op; and a discarded delivery can't be imported.
    expect(await queries.discardKpiIngest(id)).toBe(false);
    expect(await queries.importKpiIngest(id, 1)).toBe(false);
    // …but it stays correctable (only superseded is read-only).
    const corrected = [row({ TotalStudent: 123 })];
    expect(await queries.updateKpiIngestRows(id, corrected)).toBe(true);
    expect((await queries.getKpiIngest(id))?.rows).toEqual(corrected);
  });

  it("records the delivery source — 'api' by default, 'manual' when passed", async () => {
    const api = await queries.createKpiIngest({
      periodLabel: "2027-02",
      label: "machine",
      rows: [row()],
    });
    expect((await queries.getKpiIngest(api.id))?.source).toBe("api");

    const manual = await queries.createKpiIngest({
      periodLabel: "2027-03",
      label: "by-hand.csv",
      rows: [row()],
      source: "manual",
    });
    expect((await queries.getKpiIngest(manual.id))?.source).toBe("manual");
    expect((await queries.listKpiIngests()).find((i) => i.id === manual.id)?.source).toBe("manual");
  });

  it("a re-push for the same period supersedes the pending delivery — audited, rows kept", async () => {
    const first = await queries.createKpiIngest({
      periodLabel: "2026-09",
      label: "sept-v1",
      rows: [row()],
    });
    const second = await queries.createKpiIngest({
      periodLabel: "2026-09",
      label: "sept-v2",
      rows: [row({ TotalStudent: 160 })],
    });
    expect(second.supersededIds).toEqual([first.id]);

    // First delivery: status flipped, but the rows stay readable forever.
    const old = await queries.getKpiIngest(first.id);
    expect(old?.status).toBe("superseded");
    expect(old?.rows).toHaveLength(1);
    expect((await queries.listKpiIngests()).find((i) => i.id === first.id)?.status).toBe("superseded");

    // Second delivery is the one (and only) pending delivery for the period.
    expect((await queries.getKpiIngest(second.id))?.status).toBe("pending");
    const pending = (await queries.listPendingKpiIngests()).filter((i) => i.periodLabel === "2026-09");
    expect(pending.map((i) => i.id)).toEqual([second.id]);

    // Superseded is the one fully read-only status: no edits, no discard, no import.
    expect(await queries.updateKpiIngestRows(first.id, [row({ TotalStudent: 999 })])).toBe(false);
    expect(await queries.discardKpiIngest(first.id)).toBe(false);
    expect(await queries.importKpiIngest(first.id, 1)).toBe(false);

    // The supersede is audited, naming old id → new id.
    const audit = (await queries.listAuditLog()).find(
      (a) => a.action === "kpi_ingest.superseded" && a.entityId === String(first.id),
    );
    expect(audit).toBeDefined();
    expect(audit?.summary).toContain(`#${first.id}`);
    expect(audit?.summary).toContain(`#${second.id}`);
    expect(audit?.actorEmail).toBe("ingest-api");
  });

  it("isKpiPeriodClosed: a finalized run closes the period; a draft run does not; reopen reopens it", async () => {
    // Nothing for the period yet → open.
    expect(await queries.isKpiPeriodClosed("2026-11")).toBe(false);

    // A pending delivery doesn't close it.
    await queries.createKpiIngest({ periodLabel: "2026-11", label: "nov-v1", rows: [row()] });
    expect(await queries.isKpiPeriodClosed("2026-11")).toBe(false);

    // A DRAFT run doesn't close it — the month is still being worked.
    const runId = await queries.createRun({
      periodLabel: "2026-11",
      filename: "nov-draft",
      csvRows: [row()],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
      status: "draft",
    });
    expect(await queries.isKpiPeriodClosed("2026-11")).toBe(false);

    // Finalizing the run closes the period; reopening it (the documented
    // correction path) opens it again.
    await queries.updateRunReview(runId, [], "finalized");
    expect(await queries.isKpiPeriodClosed("2026-11")).toBe(true);
    expect(await queries.reopenRun(runId)).toBe(true);
    expect(await queries.isKpiPeriodClosed("2026-11")).toBe(false);
  });

  it("isKpiPeriodClosed: an imported delivery closes the period even without a finalized run", async () => {
    const { id } = await queries.createKpiIngest({ periodLabel: "2026-12", label: "dec-v1", rows: [row()] });
    // Import it into a DRAFT run — closure must come from the ingest status alone.
    const runId = await queries.createRun({
      periodLabel: "2026-12",
      filename: "dec-draft",
      csvRows: [row()],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
      status: "draft",
    });
    expect(await queries.isKpiPeriodClosed("2026-12")).toBe(false);
    expect(await queries.importKpiIngest(id, runId)).toBe(true);
    expect(await queries.isKpiPeriodClosed("2026-12")).toBe(true);
    // Discarded/superseded deliveries never close a period (other periods unaffected).
    expect(await queries.isKpiPeriodClosed("2027-01")).toBe(false);
  });

  it("a re-push never touches imported (or discarded) deliveries for the period", async () => {
    const rows = [row({ Instructor: "OCT [BK]" })];
    const imported = await queries.createKpiIngest({ periodLabel: "2026-10", label: "oct-v1", rows });
    const runId = await queries.createRun({
      periodLabel: "2026-10",
      filename: "oct-v1",
      csvRows: rows,
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
    });
    expect(await queries.importKpiIngest(imported.id, runId)).toBe(true);

    const discarded = await queries.createKpiIngest({ periodLabel: "2026-10", label: "oct-v2", rows });
    expect(await queries.discardKpiIngest(discarded.id)).toBe(true);

    // Neither the imported nor the discarded delivery is pending → nothing to supersede.
    const repush = await queries.createKpiIngest({ periodLabel: "2026-10", label: "oct-v3", rows });
    expect(repush.supersededIds).toEqual([]);
    expect((await queries.getKpiIngest(imported.id))?.status).toBe("imported");
    expect((await queries.getKpiIngest(imported.id))?.importedRunId).toBe(runId);
    expect((await queries.getKpiIngest(discarded.id))?.status).toBe("discarded");
    expect((await queries.getKpiIngest(repush.id))?.status).toBe("pending");
  });
});

describe("KPI period-close atomicity + coach auto-create race (PGlite in-memory)", () => {
  let queries: typeof import("./queries");

  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("createKpiIngestChecked stages into an OPEN period and refuses one CLOSED by a finalized run", async () => {
    const period = "2028-03";
    const open = await queries.createKpiIngestChecked({ periodLabel: period, label: "v1", rows: [row()] });
    expect(open.closed).toBe(false);

    // Finalizing a run closes the period (both take the same advisory lock).
    await queries.createRun({
      periodLabel: period,
      filename: "mar",
      csvRows: [row()],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
      status: "finalized",
    });

    const blocked = await queries.createKpiIngestChecked({ periodLabel: period, label: "v2", rows: [row()] });
    expect(blocked.closed).toBe(true);
    // The refused push staged nothing — only the first (still-pending) delivery exists.
    const list = (await queries.listKpiIngests()).filter((i) => i.periodLabel === period);
    expect(list).toHaveLength(1);
  });

  it("createKpiIngestChecked refuses a period closed only by an imported delivery", async () => {
    const period = "2028-04";
    const staged = await queries.createKpiIngestChecked({ periodLabel: period, label: "v1", rows: [row()] });
    expect(staged.closed).toBe(false);
    if (staged.closed) throw new Error("unreachable — just asserted not closed");

    // Import it into a DRAFT run: closure comes from the ingest status alone.
    const runId = await queries.createRun({
      periodLabel: period,
      filename: "apr-draft",
      csvRows: [row()],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
      status: "draft",
    });
    expect(await queries.importKpiIngest(staged.id, runId)).toBe(true);

    const blocked = await queries.createKpiIngestChecked({ periodLabel: period, label: "v2", rows: [row()] });
    expect(blocked.closed).toBe(true);
  });

  it("concurrent ensureCoachForAllowance for one new name yields a single row, never a unique-violation 500", async () => {
    const name = "RACE ALLOWANCE COACH";
    // Fired together so their read→insert windows overlap. The unique index +
    // onConflictDoUpdate must resolve every loser to the existing row, not throw.
    const ids = await Promise.all([
      queries.ensureCoachForAllowance({ coachId: null, canonicalName: name, center: "Berkeley", tier: "T1" }),
      queries.ensureCoachForAllowance({ coachId: null, canonicalName: name, center: "Berkeley", tier: "T1" }),
      queries.ensureCoachForAllowance({ coachId: null, canonicalName: name, center: "Berkeley", tier: "T1" }),
    ]);
    expect(new Set(ids).size).toBe(1);
    const rows = (await queries.listCoaches()).filter((c) => c.canonicalName === name);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.allowanceTier).toBe("T1");
  });
});
