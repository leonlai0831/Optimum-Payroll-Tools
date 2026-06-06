import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createAssessment, recordAudit } from "@/lib/db/queries";
import { computeAssessment } from "@/lib/assessment/calc";
import type { RatingMap } from "@/lib/assessment/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireCapability("edit_appraisals");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as {
    coachId?: number;
    observedOn?: string;
    assessor?: string;
    classType?: string;
    poolType?: string;
    pax?: number | null;
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

  const row = await createAssessment({
    coachId: body.coachId,
    observedOn: Number.isNaN(observed.getTime()) ? new Date() : observed,
    assessor: (body.assessor ?? "").trim(),
    classType: (body.classType ?? "").trim(),
    poolType: (body.poolType ?? "").trim(),
    pax: typeof body.pax === "number" ? body.pax : null,
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
