import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteTeachingRun, getTeachingRun, recordAudit } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const run = await getTeachingRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await params;
  const run = await getTeachingRun(Number(id));
  await deleteTeachingRun(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "teaching_run.delete",
      entity: "teaching_run",
      entityId: id,
      summary: `Deleted coaching income for ${run?.periodLabel ?? id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
