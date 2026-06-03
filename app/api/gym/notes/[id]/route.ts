import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteGymNote, recordAudit } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireCapability("edit_notes");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await params;
  await deleteGymNote(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "gym_note.delete",
      entity: "gym_note",
      entityId: id,
      summary: `Deleted gym-staff note #${id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
