import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  createCommissionRun,
  getCommissionConfigFresh,
  listCommissionRuns,
  recordAudit,
} from "@/lib/db/queries";
import { computeCommission } from "@/lib/commission/calc";
import type { CommissionConfig, CommissionRow } from "@/lib/commission/types";

export const dynamic = "force-dynamic";

export async function GET() {
  // Saved commission runs carry per-staff earnings — gate on the commission
  // module's capability (matches the POST/DELETE siblings and history page).
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  return NextResponse.json(await listCommissionRuns());
}

/**
 * Save a month. The summary is recomputed server-side from the consolidated rows
 * + config snapshot, so the stored result is always authoritative.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as {
    periodLabel?: string;
    filename?: string;
    rows?: CommissionRow[];
    config?: CommissionConfig;
  };
  if (!body.periodLabel) {
    return NextResponse.json({ error: "periodLabel is required" }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }

  // Snapshot from the client-sent config, else read FRESH (cache-bypassing) so a
  // multi-instance deploy never builds the persisted snapshot from stale rates.
  const config = body.config ?? (await getCommissionConfigFresh());
  const summary = computeCommission(body.rows, config);
  const id = await createCommissionRun({
    periodLabel: body.periodLabel,
    filename: body.filename ?? "",
    salesRows: body.rows,
    configSnapshot: config,
    summary,
  });

  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "commission_run.save",
      entity: "commission_run",
      entityId: id,
      summary: `Saved Optimum Fit commission for ${body.periodLabel} (${summary.staff.length} staff, ${(summary.rate * 100).toFixed(0)}% rate)`,
    });
  }
  return NextResponse.json({ ok: true, id });
}
