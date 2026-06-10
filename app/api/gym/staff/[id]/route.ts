import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteGymStaff, getGymStaffMember, recordAudit, updateGymStaff } from "@/lib/db/queries";
import type { GymStaffInput } from "@/lib/gym/types";

export const dynamic = "force-dynamic";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireCapability("fit_edit_staff");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as GymStaffInput;
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  await updateGymStaff(Number(id), {
    name: body.name.trim(),
    staffCode: (body.staffCode ?? "").trim(),
    position: body.position,
    employmentType: body.employmentType,
    email: (body.email ?? "").trim(),
    phone: (body.phone ?? "").trim(),
    aliases: (body.aliases ?? []).map((a) => a.trim()).filter(Boolean),
    active: body.active ?? true,
  });
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "gym_staff.update",
      entity: "gym_staff",
      entityId: id,
      summary: `Updated gym staff ${body.name.trim()}`,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireCapability("fit_edit_staff");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await params;
  const member = await getGymStaffMember(Number(id));
  await deleteGymStaff(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "gym_staff.delete",
      entity: "gym_staff",
      entityId: id,
      summary: `Deleted gym staff ${member?.name ?? id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
