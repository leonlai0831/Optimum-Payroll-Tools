import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createGymStaff, listGymStaff, recordAudit } from "@/lib/db/queries";
import type { GymStaffInput } from "@/lib/gym/types";

export const dynamic = "force-dynamic";

export async function GET() {
  // Returns the full gym-staff roster (with earnings linkage) — gate on
  // `fit_view_staff`, the all-staff data gate every role reaching the Staff
  // Earnings module (admin/supervisor) also holds.
  const denied = await requireCapability("fit_view_staff");
  if (denied) return denied;
  return NextResponse.json(await listGymStaff());
}

export async function POST(req: Request) {
  const denied = await requireCapability("fit_edit_staff");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as GymStaffInput;
  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const id = await createGymStaff({
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
      action: "gym_staff.create",
      entity: "gym_staff",
      entityId: id,
      summary: `Added gym staff ${body.name.trim()} (${body.position}, ${body.employmentType})`,
    });
  }
  return NextResponse.json({ ok: true, id });
}
