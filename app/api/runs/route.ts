import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createRun, listRuns, recordAudit } from "@/lib/db/queries";
import type { AppConfig, InstructorRow } from "@/lib/kpi/types";
import type { RunCoach } from "@/lib/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listRuns());
}

export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json()) as {
    periodLabel: string;
    filename: string;
    csvRows: InstructorRow[];
    configSnapshot: AppConfig;
    coachResults: RunCoach[];
  };
  if (!body.periodLabel) {
    return NextResponse.json({ error: "periodLabel is required" }, { status: 400 });
  }
  const id = await createRun(body);
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "kpi_run.save",
      entity: "run",
      entityId: id,
      summary: `Saved KPI bonus run for ${body.periodLabel} (${body.coachResults?.length ?? 0} coaches)`,
    });
  }
  return NextResponse.json({ ok: true, id });
}
