import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteFreelancerRun, getFreelancerRun, recordAudit } from "@/lib/db/queries";

export async function GET(_req: Request, ctx: RouteContext<"/api/freelancer/runs/[id]">) {
  // A single freelancer run is a staff pay record — same gate as the siblings.
  const denied = await requireCapability("run_freelancer");
  if (denied) return denied;
  const { id } = await ctx.params;
  const run = await getFreelancerRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/freelancer/runs/[id]">) {
  const denied = await requireCapability("run_freelancer");
  if (denied) return denied;
  const { id } = await ctx.params;
  const run = await getFreelancerRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  await deleteFreelancerRun(Number(id));
  const actor = await getCurrentUser();
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "freelancer.delete",
      entity: "freelancer_run",
      entityId: Number(id),
      summary: `Deleted freelancer payment for ${run.canonicalName} (${run.periodLabel})`,
    });
  }
  return NextResponse.json({ ok: true });
}
