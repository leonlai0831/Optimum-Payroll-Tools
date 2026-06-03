import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteNote, recordAudit } from "@/lib/db/queries";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/staff/notes/[id]">) {
  const denied = await requireCapability("edit_notes");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await ctx.params;
  await deleteNote(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "note.delete",
      entity: "note",
      entityId: id,
      summary: `Deleted note #${id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
