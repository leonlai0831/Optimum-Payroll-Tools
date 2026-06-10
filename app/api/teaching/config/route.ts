import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getTeachingConfig, recordAudit, saveTeachingConfig } from "@/lib/db/queries";
import type { TeachingConfig } from "@/lib/teaching/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getTeachingConfig());
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const clampRate = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100000, Math.max(0, n)) : 0;
};

export async function PUT(req: Request) {
  const denied = await requireCapability("fit_edit_settings");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const raw = (await req.json().catch(() => null)) as TeachingConfig | null;

  // Hardening (route already requires fit_edit_settings): reject malformed bodies and
  // clamp the per-session/attendee rates to sane non-negative ringgit.
  if (!isObject(raw)) {
    return NextResponse.json({ error: "invalid config body" }, { status: 400 });
  }
  const data: TeachingConfig = {
    ptRate: clampRate(raw.ptRate),
    groupRate: clampRate(raw.groupRate),
    ptKeywords: Array.isArray(raw.ptKeywords)
      ? raw.ptKeywords.map((k) => String(k)).filter(Boolean)
      : [],
  };

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
