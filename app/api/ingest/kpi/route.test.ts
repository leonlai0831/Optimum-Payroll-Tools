import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite + a known bearer key, set BEFORE the route (and its db
// import chain) loads. Mirrors lib/db/ingest.test.ts.
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;
process.env.INGEST_API_KEY = "test-ingest-key";

const URL_BASE = "http://test.local/api/ingest/kpi";
const AUTH = { authorization: "Bearer test-ingest-key" };

function post(opts: { url?: string; headers?: Record<string, string>; body: string }) {
  return new Request(opts.url ?? URL_BASE, {
    method: "POST",
    headers: { ...AUTH, ...opts.headers },
    body: opts.body,
  });
}

const CSV = [
  "tr_name,cr_name,TTL-LVL,TTL-COLOR,Black,UP,STUDENT_STOP,STUDENT_ATTENDED_CLASS",
  "COBYS [BK],Berkeley,152,38,5,9,2,580",
  "MINA [PK],Puchong Kinrara,140,30,3,7,1,520",
].join("\n");

describe("POST /api/ingest/kpi (route behavior, PGlite in-memory)", () => {
  let POST: (req: Request) => Promise<Response>;
  let queries: typeof import("@/lib/db/queries");

  beforeAll(async () => {
    ({ POST } = await import("./route"));
    queries = await import("@/lib/db/queries");
  });

  it("JSON mode still works unchanged", async () => {
    const res = await POST(
      post({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodLabel: "2026-04",
          label: "json-push",
          rows: [{ tr_name: "COBYS [BK]", cr_name: "Berkeley", UP: 9 }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, rows: 1 });

    const stored = await queries.getKpiIngest(json.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.rows[0]).toMatchObject({ Instructor: "COBYS [BK]", LevelUp: 9 });
  });

  it("text/csv body stages normalized rows, periodLabel + label from query params", async () => {
    const res = await POST(
      post({
        url: `${URL_BASE}?periodLabel=2026-06&label=june-export`,
        headers: { "content-type": "text/csv" },
        body: CSV,
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, rows: 2 });

    const stored = await queries.getKpiIngest(json.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.periodLabel).toBe("2026-06");
    expect(stored?.label).toBe("june-export");
    // Same normalization as the JSON push / dashboard upload.
    expect(stored?.rows[0]).toMatchObject({
      Instructor: "COBYS [BK]",
      Center: "Berkeley",
      TotalStudent: 152,
      TotalColor: 38,
      LevelUp: 9,
      Stop: 2,
      Attended: 580,
    });
  });

  it("octet-stream / missing content type sniffs: JSON body → JSON mode, CSV body → CSV mode", async () => {
    const sniffedJson = await POST(
      post({
        headers: { "content-type": "application/octet-stream" },
        body: JSON.stringify({ periodLabel: "2026-03", rows: [{ Instructor: "A" }] }),
      }),
    );
    expect(sniffedJson.status).toBe(200);

    // A byte body keeps the Request free of an auto content-type header.
    const sniffedCsv = await POST(
      new Request(`${URL_BASE}?periodLabel=2026-02`, {
        method: "POST",
        headers: AUTH,
        body: new TextEncoder().encode(CSV),
      }),
    );
    expect(sniffedCsv.status).toBe(200);
    expect((await sniffedCsv.json()).rows).toBe(2);
  });

  it("CSV mode 400s say which mode failed and why", async () => {
    // Missing periodLabel query param.
    const noPeriod = await POST(post({ headers: { "content-type": "text/csv" }, body: CSV }));
    expect(noPeriod.status).toBe(400);
    expect((await noPeriod.json()).error).toMatch(/^CSV body: .*periodLabel query parameter/);

    // Header-only file.
    const headerOnly = await POST(
      post({
        url: `${URL_BASE}?periodLabel=2026-06`,
        headers: { "content-type": "text/csv" },
        body: "tr_name,cr_name\n",
      }),
    );
    expect(headerOnly.status).toBe(400);
    expect((await headerOnly.json()).error).toBe("CSV body: CSV has a header row but no data rows.");

    // Parses as CSV but has no instructor column → same shared check as JSON mode.
    const noInstructor = await POST(
      post({
        url: `${URL_BASE}?periodLabel=2026-06`,
        headers: { "content-type": "text/csv" },
        body: "foo,bar\n1,2",
      }),
    );
    expect(noInstructor.status).toBe(400);
    expect((await noInstructor.json()).error).toMatch(/No instructor column found/);
  });

  it("JSON mode 400s say which mode failed and why", async () => {
    const notJson = await POST(
      post({ headers: { "content-type": "application/json" }, body: "tr_name\nCOBYS" }),
    );
    expect(notJson.status).toBe(400);
    expect((await notJson.json()).error).toMatch(/^JSON body: not valid JSON/);

    const badPeriod = await POST(
      post({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodLabel: "June 2026", rows: [{ Instructor: "A" }] }),
      }),
    );
    expect(badPeriod.status).toBe(400);
    expect((await badPeriod.json()).error).toMatch(/^JSON body: periodLabel/);
  });

  it("bearer auth still gates both modes", async () => {
    const res = await POST(
      new Request(`${URL_BASE}?periodLabel=2026-06`, {
        method: "POST",
        headers: { "content-type": "text/csv", authorization: "Bearer wrong" },
        body: CSV,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("409s a push once a FINALIZED run exists for the period — nothing written, pending untouched", async () => {
    const push = () =>
      POST(
        post({
          url: `${URL_BASE}?periodLabel=2025-01&label=jan`,
          headers: { "content-type": "text/csv" },
          body: CSV,
        }),
      );

    // A delivery staged BEFORE the month was finalized stays exactly as it was.
    const first = await (await push()).json();
    expect(first.ok).toBe(true);

    await queries.createRun({
      periodLabel: "2025-01",
      filename: "jan.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
    }); // status defaults to "finalized"

    // CSV mode rejected with the owner-approved message…
    const csvRes = await push();
    expect(csvRes.status).toBe(409);
    expect((await csvRes.json()).error).toBe(
      "2025-01 is already finalized — ask the payroll admin to reopen it if a correction is needed.",
    );
    // …and JSON mode too (same check, both body formats).
    const jsonRes = await POST(
      post({
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodLabel: "2025-01", rows: [{ Instructor: "A" }] }),
      }),
    );
    expect(jsonRes.status).toBe(409);

    // A rejected push writes NOTHING: the original delivery is still the only
    // one for the period and is still pending (not superseded).
    const forPeriod = (await queries.listKpiIngests()).filter((i) => i.periodLabel === "2025-01");
    expect(forPeriod.map((i) => ({ id: i.id, status: i.status }))).toEqual([
      { id: first.id, status: "pending" },
    ]);
    // …and leaves no audit trail (only the first push's "received" entry exists).
    const audits = (await queries.listAuditLog()).filter((a) => a.summary.includes("2025-01"));
    expect(audits.map((a) => a.action)).toEqual(["kpi_ingest.received"]);
  });

  it("a DRAFT run does not block a push — accepted, and a re-push still supersedes", async () => {
    await queries.createRun({
      periodLabel: "2025-02",
      filename: "feb-draft.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
      status: "draft",
    });

    const push = () =>
      POST(
        post({
          url: `${URL_BASE}?periodLabel=2025-02`,
          headers: { "content-type": "text/csv" },
          body: CSV,
        }),
      );
    const first = await (await push()).json();
    expect(first).toMatchObject({ ok: true, superseded: 0 });

    // Pending-only period (the draft run doesn't close it): the re-push is
    // accepted and supersedes the earlier pending delivery as usual.
    const second = await (await push()).json();
    expect(second).toMatchObject({ ok: true, superseded: 1 });
    expect((await queries.getKpiIngest(first.id))?.status).toBe("superseded");
  });

  it("409s once any delivery for the period was imported, even with no finalized run", async () => {
    const push = () =>
      POST(
        post({
          url: `${URL_BASE}?periodLabel=2025-03`,
          headers: { "content-type": "text/csv" },
          body: CSV,
        }),
      );
    const { id } = await (await push()).json();
    // Import into a DRAFT run: the 409 must come from the imported delivery alone.
    const runId = await queries.createRun({
      periodLabel: "2025-03",
      filename: "mar.csv",
      csvRows: [],
      configSnapshot: queries.defaultConfig(),
      coachResults: [],
      status: "draft",
    });
    expect(await queries.importKpiIngest(id, runId)).toBe(true);

    const rejected = await push();
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).error).toMatch(/already finalized/);
    // The imported delivery is untouched and nothing new exists for the period.
    expect((await queries.getKpiIngest(id))?.status).toBe("imported");
    expect((await queries.listKpiIngests()).filter((i) => i.periodLabel === "2025-03")).toHaveLength(1);
  });

  it("re-pushing the same period reports how many pending deliveries it superseded", async () => {
    const push = () =>
      POST(
        post({
          url: `${URL_BASE}?periodLabel=2026-01&label=re-push`,
          headers: { "content-type": "text/csv" },
          body: CSV,
        }),
      );

    const first = await (await push()).json();
    expect(first).toMatchObject({ ok: true, superseded: 0 });

    const second = await (await push()).json();
    expect(second).toMatchObject({ ok: true, superseded: 1 });

    expect((await queries.getKpiIngest(first.id))?.status).toBe("superseded");
    expect((await queries.getKpiIngest(second.id))?.status).toBe("pending");
  });
});
