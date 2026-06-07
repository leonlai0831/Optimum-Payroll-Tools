import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getCommissionConfig, recordAudit, saveCommissionConfig } from "@/lib/db/queries";
import type { CommissionConfig, RateBand } from "@/lib/commission/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getCommissionConfig());
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const clampRate = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
};

/** Coerce/clamp one rate band: non-negative integer counts, rate in [0,1]. */
function sanitizeBand(b: unknown): RateBand {
  const o = isObject(b) ? b : {};
  const minCount = Math.max(0, Math.trunc(Number(o.minCount) || 0));
  const rawMax = o.maxCount;
  const maxCount =
    rawMax == null ? null : Math.max(minCount, Math.trunc(Number(rawMax) || 0));
  return { minCount, maxCount, rate: clampRate(o.rate) };
}

export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const raw = (await req.json().catch(() => null)) as CommissionConfig | null;

  // Hardening (route already requires edit_settings): reject malformed bodies and
  // clamp band counts/rates to sane ranges before persisting.
  if (!isObject(raw) || !Array.isArray(raw.bands)) {
    return NextResponse.json({ error: "invalid config body" }, { status: 400 });
  }
  const data: CommissionConfig = {
    bands: raw.bands.map(sanitizeBand),
    belowMinRate: clampRate(raw.belowMinRate),
  };

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
