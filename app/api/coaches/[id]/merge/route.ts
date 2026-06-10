import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { mergeCoaches, recordAudit } from "@/lib/db/queries";

/**
 * Merge a duplicate staff profile into this one (`[id]` = the survivor).
 * Destructive (the duplicate row is deleted), so it is audited and gated on
 * the same `swim_edit_staff` capability as profile edits/deletes.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/coaches/[id]/merge">) {
  const denied = await requireCapability("swim_edit_staff");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const survivorId = Number(id);
  const body = (await req.json().catch(() => ({}))) as { duplicateId?: unknown };
  const duplicateId = Number(body.duplicateId);
  if (!Number.isInteger(survivorId) || !Number.isInteger(duplicateId)) {
    return NextResponse.json({ error: "duplicateId is required." }, { status: 400 });
  }

  try {
    const result = await mergeCoaches(survivorId, duplicateId);
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "coach.merge",
      entity: "coach",
      entityId: survivorId,
      summary:
        `Merged ${result.duplicateName} into ${result.survivorName}` +
        (result.conflictingPeriods.length
          ? ` (allowance periods kept under the old name: ${result.conflictingPeriods.join(", ")})`
          : ""),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Merge failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
