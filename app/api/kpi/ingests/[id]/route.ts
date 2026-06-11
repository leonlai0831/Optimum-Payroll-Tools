import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  discardKpiIngest,
  getKpiIngest,
  recordAudit,
  updateKpiIngestRows,
} from "@/lib/db/queries";
import { hasInstructorHeader, mapCsvRows } from "@/lib/kpi/csv";

export const dynamic = "force-dynamic";

/**
 * Owner-side mutations on a staged KPI delivery. PATCH replaces the rows
 * (add/edit/delete happen client-side and the full set is saved back) on any
 * NON-SUPERSEDED delivery — pending, imported and discarded records stay
 * correctable as the monthly database of student data; a superseded delivery
 * is read-only (a newer push replaced it — correct that one). Editing an
 * imported delivery never changes the saved KPI run, which snapshotted the
 * rows at import time. DELETE discards a pending delivery — a status flip,
 * never a hard delete, so every delivery stays viewable forever.
 */

export async function PATCH(req: Request, ctx: RouteContext<"/api/kpi/ingests/[id]">) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await ctx.params;
  const ingestId = Number(id);
  const ingest = await getKpiIngest(ingestId);
  if (!ingest) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ingest.status === "superseded") {
    return NextResponse.json(
      { error: "This delivery was superseded by a newer push and can no longer be edited." },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { rows?: unknown };
  if (
    !Array.isArray(body.rows) ||
    body.rows.length === 0 ||
    !body.rows.every((r) => r != null && typeof r === "object" && !Array.isArray(r))
  ) {
    return NextResponse.json({ error: "rows must be a non-empty array of objects." }, { status: 400 });
  }
  if (!hasInstructorHeader(body.rows as Record<string, unknown>[])) {
    return NextResponse.json({ error: "rows are missing the Instructor field." }, { status: 400 });
  }
  // Re-normalize through the CSV header mapping (idempotent on canonical rows) so
  // a hand-edited payload can never store a malformed shape.
  const rows = mapCsvRows(body.rows as Record<string, unknown>[]);
  const updated = await updateKpiIngestRows(ingestId, rows);
  if (!updated) {
    return NextResponse.json({ error: "This delivery can no longer be edited." }, { status: 409 });
  }
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "kpi_ingest.edited",
      entity: "kpi_ingest",
      entityId: ingestId,
      summary: `Edited staged KPI rows for ${ingest.periodLabel} (${ingest.rows.length} → ${rows.length} rows)`,
    });
  }
  return NextResponse.json({ ok: true, rows: rows.length });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/kpi/ingests/[id]">) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await ctx.params;
  const ingestId = Number(id);
  const ingest = await getKpiIngest(ingestId);
  if (!ingest) return NextResponse.json({ error: "not found" }, { status: 404 });
  const discarded = await discardKpiIngest(ingestId);
  if (!discarded) {
    return NextResponse.json(
      { error: `This delivery is ${ingest.status} and can no longer be discarded.` },
      { status: 409 },
    );
  }
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "kpi_ingest.discarded",
      entity: "kpi_ingest",
      entityId: ingestId,
      summary: `Discarded staged KPI delivery for ${ingest.periodLabel}${ingest.label ? ` (${ingest.label})` : ""}`,
    });
  }
  return NextResponse.json({ ok: true });
}
