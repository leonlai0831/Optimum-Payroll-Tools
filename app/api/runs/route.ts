import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createRun, listRuns, recordAudit, runStatusFromResults } from "@/lib/db/queries";
import { validateRunPayload } from "@/lib/kpi/run-validate";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { RunCoach } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  // Saved KPI runs carry per-coach bonus/pay data — gate on the KPI module's
  // capability (matches the POST/DELETE siblings and the KPI history page).
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  return NextResponse.json(await listRuns());
}

export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as {
    periodLabel?: string;
    filename?: string;
    csvRows?: InstructorRow[];
    configSnapshot?: AppConfig;
    coachResults?: RunCoach[];
  };
  if (!body.periodLabel) {
    return NextResponse.json({ error: "periodLabel is required" }, { status: 400 });
  }
  // The KPI engine runs client-side, so never trust client-computed money
  // blindly: require a config snapshot + coach array, and re-check the
  // payout = finalScore × teachingAllowance invariant before persisting.
  const invalid = validateRunPayload(body);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }
  // A month with any incomplete coach (e.g. management review pending) is saved as
  // a draft; it becomes finalized only once every coach is complete.
  const status = runStatusFromResults(body.coachResults ?? []);
  const id = await createRun({
    periodLabel: body.periodLabel,
    filename: body.filename ?? "",
    csvRows: body.csvRows ?? [],
    configSnapshot: body.configSnapshot as AppConfig,
    coachResults: body.coachResults ?? [],
    status,
  });
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "kpi_run.save",
      entity: "run",
      entityId: id,
      summary: `Saved KPI bonus run for ${body.periodLabel} (${body.coachResults?.length ?? 0} coaches, ${status})`,
    });
  }
  return NextResponse.json({ ok: true, id, status });
}
