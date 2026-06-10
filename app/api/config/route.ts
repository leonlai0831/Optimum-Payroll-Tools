import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getConfig, recordAudit, saveConfig } from "@/lib/db/queries";
import type { AppConfig, MetricConfig } from "@/lib/kpi/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getConfig());
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Enabled-metric weights in a list must total 100% (mirrors the Settings UI). */
function enabledWeightsTotal100(list: MetricConfig[]): boolean {
  if (!Array.isArray(list)) return false;
  const total = list.filter((m) => m?.enabled).reduce((s, m) => s + (Number(m?.w) || 0), 0);
  return Math.round(total * 100) === 100;
}

export async function PUT(req: Request) {
  const denied = await requireCapability("swim_edit_settings");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const data = (await req.json().catch(() => null)) as AppConfig | null;

  // Hardening (route already requires swim_edit_settings): reject malformed bodies and
  // enforce the documented "enabled metric weights total 100%" invariant in both
  // the personal and center KPI lists before persisting.
  if (!isObject(data) || !Array.isArray(data.personalKpi) || !Array.isArray(data.centerKpi)) {
    return NextResponse.json({ error: "invalid config body" }, { status: 400 });
  }
  if (!enabledWeightsTotal100(data.personalKpi) || !enabledWeightsTotal100(data.centerKpi)) {
    return NextResponse.json(
      { error: "Enabled metric weights must total 100% in both the personal and center lists." },
      { status: 400 },
    );
  }

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
