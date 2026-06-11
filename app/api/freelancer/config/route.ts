import { NextResponse } from "next/server";
import { isAuthed, getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getFreelancerConfig, recordAudit, saveFreelancerConfig } from "@/lib/db/queries";
import {
  FREELANCER_POSITIONS,
  type FreelancerConfig,
  type FreelancerPosition,
  type FreelancerRate,
} from "@/lib/freelancer/types";
import { DEFAULT_FREELANCER_CONFIG } from "@/lib/freelancer/defaults";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getFreelancerConfig());
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Clamp a numeric leaf into [0, max] (0 when not a finite number). */
const clamp = (v: unknown, max: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

/**
 * Sanitize an untrusted config body. Only the NUMBERS are editable for v1: the
 * per-position rates, the attendance bonus, and the commitment matrix values.
 * Structure (positions, thresholds count, center groups, entities) always comes
 * from the stored config, so a malformed payload can't corrupt the lookup axes.
 */
function sanitizeConfig(raw: Record<string, unknown>, current: FreelancerConfig): FreelancerConfig {
  const rates = {} as Record<FreelancerPosition, FreelancerRate>;
  const rawRates = isObject(raw.rates) ? raw.rates : {};
  for (const pos of FREELANCER_POSITIONS) {
    const r = isObject(rawRates[pos]) ? (rawRates[pos] as Record<string, unknown>) : undefined;
    const fallback = current.rates[pos] ?? DEFAULT_FREELANCER_CONFIG.rates[pos];
    rates[pos] = {
      groupA: r ? clamp(r.groupA, 10000) : fallback.groupA,
      groupB: r ? clamp(r.groupB, 10000) : fallback.groupB,
    };
  }

  const rawMatrix = isObject(raw.commitment) ? (raw.commitment as Record<string, unknown>) : {};
  const rawValues = Array.isArray(rawMatrix.values) ? rawMatrix.values : [];
  const values = current.commitment.values.map((row, ri) =>
    row.map((v, ci) => {
      const sent = Array.isArray(rawValues[ri]) ? (rawValues[ri] as unknown[])[ci] : undefined;
      return sent === undefined ? v : clamp(sent, 10); // multipliers, not ringgit
    }),
  );

  return {
    rates,
    groupACenters: [...current.groupACenters],
    commitment: { ...structuredClone(current.commitment), values },
    attendanceBonus: raw.attendanceBonus === undefined ? current.attendanceBonus : clamp(raw.attendanceBonus, 10),
    entities: structuredClone(current.entities),
  };
}

export async function PUT(req: Request) {
  const denied = await requireCapability("swim_edit_settings");
  if (denied) return denied;
  const data = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isObject(data)) {
    return NextResponse.json({ error: "invalid config body" }, { status: 400 });
  }
  const current = await getFreelancerConfig();
  await saveFreelancerConfig(sanitizeConfig(data, current));
  const actor = await getCurrentUser();
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "freelancer.config_update",
      entity: "freelancer_config",
      entityId: 1,
      summary: "Updated freelancer payment rates / bonuses",
    });
  }
  return NextResponse.json({ ok: true });
}
