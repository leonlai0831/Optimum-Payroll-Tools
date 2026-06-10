import { NextResponse } from "next/server";
import { checkIngestBearer } from "@/lib/ingest/auth";
import { hasInstructorHeader, mapCsvRows } from "@/lib/kpi/csv";
import { createKpiIngest, recordAudit } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Machine endpoint: an external system pushes the monthly KPI data here instead
 * of the owner uploading a CSV by hand. The payload is STAGED as a pending
 * `kpi_ingests` row — it is never scored or saved as a run directly; the owner
 * reviews/edits it on /kpi/ingests and loads it into the calculator.
 *
 * Auth is a bearer key (`Authorization: Bearer <INGEST_API_KEY>`), not a session
 * cookie — the proxy exempts /api/ingest from the cookie redirect. With the env
 * var unset the endpoint is OFF (503), mirroring how optional integrations
 * degrade elsewhere in the app.
 */

/** Rows arrive with the same flexible headers a CSV upload would have. */
type RawRow = Record<string, unknown>;

/** Hard cap on the JSON body — a month of tutor rows is a few hundred KB at most. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

// Best-effort, in-process throttle per IP (mirrors the login route): a machine
// sender pushes a handful of times a month, so 30 requests / 15 min is generous
// while still blunting key brute-forcing. Per-instance only, like login.
const MAX_REQUESTS = 30;
const WINDOW_MS = 15 * 60 * 1000;
const hits = new Map<string, { count: number; resetAt: number }>();

/** First IP in X-Forwarded-For (Vercel sets it), else a stable fallback. */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_REQUESTS;
}

export async function POST(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const auth = checkIngestBearer(req.headers.get("authorization"), process.env.INGEST_API_KEY);
  if (auth === "no_server_key") {
    return NextResponse.json(
      { ok: false, error: "Ingest API is not configured: set INGEST_API_KEY on the server to enable it." },
      { status: 503 },
    );
  }
  if (auth === "unauthorized") {
    return NextResponse.json(
      { ok: false, error: "Invalid or missing bearer key." },
      { status: 401 },
    );
  }

  // Cap the payload before parsing. Content-Length catches honest clients early;
  // the post-read length check is authoritative (the header can lie or be absent).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large (max 2 MB)." }, { status: 413 });
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large (max 2 MB)." }, { status: 413 });
  }

  let body: { periodLabel?: unknown; label?: unknown; rows?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be valid JSON." }, { status: 400 });
  }

  const periodLabel = typeof body.periodLabel === "string" ? body.periodLabel.trim() : "";
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(periodLabel)) {
    return NextResponse.json(
      { ok: false, error: 'periodLabel is required in "YYYY-MM" format.' },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "rows must be a non-empty array of objects." },
      { status: 400 },
    );
  }
  const rawRows = body.rows as unknown[];
  if (!rawRows.every((r) => r != null && typeof r === "object" && !Array.isArray(r))) {
    return NextResponse.json(
      { ok: false, error: "rows must be a non-empty array of objects." },
      { status: 400 },
    );
  }
  if (!hasInstructorHeader(rawRows as RawRow[])) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No instructor column found — rows need a header like Instructor / tr_name / coach (same flexible headers as the CSV upload).",
      },
      { status: 400 },
    );
  }

  // Normalize through the exact same header mapping the CSV upload uses, so a
  // staged delivery behaves identically to a hand-uploaded file from here on.
  const rows = mapCsvRows(rawRows as RawRow[]);
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : "";
  const id = await createKpiIngest({ periodLabel, label, rows });
  await recordAudit({
    actorId: null,
    actorEmail: "ingest-api",
    action: "kpi_ingest.received",
    entity: "kpi_ingest",
    entityId: id,
    summary: `Received ${rows.length} KPI rows for ${periodLabel}${label ? ` (${label})` : ""}`,
  });
  return NextResponse.json({ ok: true, id, rows: rows.length });
}
