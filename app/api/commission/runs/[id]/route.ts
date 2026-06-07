import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteCommissionRun, getCommissionRun, recordAudit } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // A single commission run carries per-staff earnings — same gate as the siblings.
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  const { id } = await params;
  const run = await getCommissionRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await params;
  const run = await getCommissionRun(Number(id));
  await deleteCommissionRun(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "commission_run.delete",
      entity: "commission_run",
      entityId: id,
      summary: `Deleted Optimum Fit commission run ${run ? `for ${run.periodLabel}` : id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
