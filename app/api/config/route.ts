import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getConfig, recordAudit, saveConfig } from "@/lib/db/queries";
import type { AppConfig } from "@/lib/kpi/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getConfig());
}

export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const data = (await req.json()) as AppConfig;
  await saveConfig(data);
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "settings.update",
      entity: "config",
      summary: "Updated KPI scoring settings",
    });
  }
  return NextResponse.json({ ok: true });
}
