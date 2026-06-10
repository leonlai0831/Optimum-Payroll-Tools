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

    const id = await queries.createKpiIngest({
      periodLabel: "2026-05",
      label: "kpi_2026_05.csv",
      rows,
    });
    expect(id).toBeGreaterThan(0);

    const stored = await queries.getKpiIngest(id);
    expect(stored?.status).toBe("pending");
    expect(stored?.rows).toEqual(rows);

    const listed = (await queries.listKpiIngests()).find((i) => i.id === id)!;
    expect(listed.rowCount).toBe(1);
    expect(listed.label).toBe("kpi_2026_05.csv");
    expect((await queries.listPendingKpiIngests()).some((i) => i.id === id)).toBe(true);
  });

  it("lets the owner edit rows while pending, but never after import", async () => {
    const id = await queries.createKpiIngest({
      periodLabel: "2026-06",
      label: "june.csv",
      rows: [row()],
    });

    // Edit: fix a value, delete nothing, add a row — the full set is replaced.
    const edited = [row({ TotalStudent: 175 }), row({ Instructor: "NEW GUY [BK]" })];
    expect(await queries.updateKpiIngestRows(id, edited)).toBe(true);
    expect((await queries.getKpiIngest(id))?.rows).toEqual(edited);

    // Import it, then editing must refuse and write nothing.
    const runId = await queries.createRun({
      periodLabel: "2026-06",
      filename: "june.csv",
      csvRows: edited,
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
    });
    expect(await queries.importKpiIngest(id, runId)).toBe(true);
    expect(await queries.updateKpiIngestRows(id, [row({ TotalStudent: 999 })])).toBe(false);
    expect((await queries.getKpiIngest(id))?.rows).toEqual(edited);
  });

  it("import marks status + run linkage, and the rows stay readable forever", async () => {
    const rows = [row({ Instructor: "KEEPER [PK]" })];
    const id = await queries.createKpiIngest({ periodLabel: "2026-07", label: "july", rows });
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
    const id = await queries.createKpiIngest({
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
  });
});
