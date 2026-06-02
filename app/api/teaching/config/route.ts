import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getTeachingConfig, recordAudit, saveTeachingConfig } from "@/lib/db/queries";
import type { TeachingConfig } from "@/lib/teaching/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getTeachingConfig());
}

export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const data = (await req.json()) as TeachingConfig;
  await saveTeachingConfig(data);
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "teaching.settings.update",
      entity: "teaching_config",
      summary: `Updated coaching-income rates (PT RM${data.ptRate}/attendee, group RM${data.groupRate}/session)`,
    });
  }
  return NextResponse.json({ ok: true });
}
