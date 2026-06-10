import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  findCoachAliasConflict,
  getCoach,
  recordAudit,
  setCoachKpiLinkNa,
  updateCoachAliases,
} from "@/lib/db/queries";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";

/** PATCH a coach's KPI-link override: mark not-applicable, and/or edit aliases. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/kpi/links/[id]">) {
  const denied = await requireCapability("swim_edit_staff");
  if (denied) return denied;
  const { id } = await ctx.params;
  const coachId = Number(id);
  const before = await getCoach(coachId);
  if (!before) return NextResponse.json({ error: "coach not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    kpiLinkNa?: boolean;
    naTier?: string | null;
    aliases?: string[];
  };

  const summary: string[] = [];

  if (typeof body.kpiLinkNa === "boolean") {
    const tier =
      typeof body.naTier === "string" && (ALLOWANCE_TIERS as readonly string[]).includes(body.naTier)
        ? (body.naTier as AllowanceTier)
        : before.allowanceTier ?? null;
    await setCoachKpiLinkNa(coachId, body.kpiLinkNa, tier);
    summary.push(body.kpiLinkNa ? `KPI link → not applicable (${tier ?? "?"})` : "KPI link → enabled");
  }

  if (Array.isArray(body.aliases)) {
    const cleaned = [...new Set(body.aliases.map((a) => a.trim()).filter(Boolean))].sort();
    // One account must belong to exactly one profile — a shared alias makes
    // uploads match ambiguously and forks histories. Reject instead of saving.
    const conflict = await findCoachAliasConflict(coachId, cleaned);
    if (conflict) {
      return NextResponse.json(
        {
          error: `"${conflict.alias}" already belongs to ${conflict.ownerName} — merge the profiles instead.`,
        },
        { status: 400 },
      );
    }
    await updateCoachAliases(coachId, cleaned);
    summary.push(`aliases → ${cleaned.length}`);
  }

  const actor = await getCurrentUser();
  if (actor && summary.length) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "coach.kpi_link",
      entity: "coach",
      entityId: id,
      summary: `KPI linkage for "${before.canonicalName}": ${summary.join(", ")}`,
    });
  }
  return NextResponse.json({ ok: true });
}
