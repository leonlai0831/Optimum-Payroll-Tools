import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getCommissionConfig, recordAudit, saveCommissionConfig } from "@/lib/db/queries";
import type { CommissionConfig } from "@/lib/commission/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getCommissionConfig());
}

export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const data = (await req.json()) as CommissionConfig;
  await saveCommissionConfig(data);
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "commission.settings.update",
      entity: "commission_config",
      summary: "Updated Optimum Fit commission rate bands",
    });
  }
  return NextResponse.json({ ok: true });
}
