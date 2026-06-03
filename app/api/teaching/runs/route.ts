import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createTeachingRun, getTeachingConfig, listTeachingRuns, recordAudit } from "@/lib/db/queries";
import { computeTeaching } from "@/lib/teaching/calc";
import type { TeachingConfig, TeachingRow } from "@/lib/teaching/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listTeachingRuns());
}

/**
 * Save a coaching month. The summary is recomputed server-side from the parsed
 * session rows + config snapshot, so the stored result is always authoritative.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json()) as {
    periodLabel: string;
    filename?: string;
    rows: TeachingRow[];
    config?: TeachingConfig;
  };
  if (!body.periodLabel?.trim()) {
    return NextResponse.json({ error: "periodLabel is required" }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }

  const config = body.config ?? (await getTeachingConfig());
  const summary = computeTeaching(body.rows, config);
  const id = await createTeachingRun({
    periodLabel: body.periodLabel.trim(),
    filename: body.filename ?? "",
    sessionRows: body.rows,
    configSnapshot: config,
    summary,
  });

  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "teaching_run.save",
      entity: "teaching_run",
      entityId: id,
      summary: `Saved Optimum Fit coaching income for ${body.periodLabel.trim()} (${summary.coaches.length} coaches, RM ${summary.totals.totalIncome.toFixed(0)})`,
    });
  }
  return NextResponse.json({ ok: true, id });
}
