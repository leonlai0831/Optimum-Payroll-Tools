import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteAssessment, getAssessment, recordAudit } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/assessments/[id]">) {
  const denied = await requireCapability("edit_appraisals");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await ctx.params;
  const before = await getAssessment(Number(id));
  await deleteAssessment(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "assessment.delete",
      entity: "assessment",
      entityId: id,
      summary: `Deleted assessment #${id}${before ? ` (coach #${before.coachId})` : ""}`,
    });
  }
  return NextResponse.json({ ok: true });
}
