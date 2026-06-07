import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createAssessment, recordAudit } from "@/lib/db/queries";
import { computeAssessment } from "@/lib/assessment/calc";
import { LEVELS, MAX_PAX, type RatingMap } from "@/lib/assessment/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireCapability("edit_appraisals");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as {
    coachId?: number;
    observedOn?: string;
    classType?: string;
    poolType?: string;
    levels?: unknown;
    pax?: number | null;
    hasHelper?: boolean;
    ratings?: RatingMap;
    comments?: string;
  };
  if (typeof body.coachId !== "number") {
    return NextResponse.json({ error: "coachId is required" }, { status: 400 });
  }

  const ratings = (body.ratings ?? {}) as RatingMap;
  // Recompute the score server-side (ignore any client value) and snapshot it.
  const { totalPercent, finalGrade } = computeAssessment(ratings);
  const observed = body.observedOn ? new Date(body.observedOn) : new Date();

  // Keep only known levels (ticked, no per-level count); pax is a single 1–MAX total.
  const rawLevels = Array.isArray(body.levels) ? body.levels : [];
  const levels = LEVELS.filter((l) => rawLevels.includes(l));
  const paxNum = Math.round(Number(body.pax));
  const pax = Number.isFinite(paxNum) && paxNum >= 1 ? Math.min(MAX_PAX, paxNum) : null;
  // The assessor is the signed-in submitter — never client-supplied.
  const assessor = actor ? actor.displayName || actor.email : "";

  const row = await createAssessment({
    coachId: body.coachId,
    observedOn: Number.isNaN(observed.getTime()) ? new Date() : observed,
    assessor,
    classType: (body.classType ?? "").trim(),
    poolType: (body.poolType ?? "").trim(),
    pax,
    levels,
    hasHelper: Boolean(body.hasHelper),
    ratings,
    totalPercent,
    finalGrade,
    comments: (body.comments ?? "").trim(),
  });
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "assessment.create",
      entity: "assessment",
      entityId: row.id,
      summary: `Assessed coach #${body.coachId} — ${totalPercent.toFixed(1)}% (${finalGrade})`,
    });
  }
  return NextResponse.json({ ok: true, id: row.id });
}
