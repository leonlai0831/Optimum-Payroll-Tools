import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getCoach, listAssessmentsForCoach } from "@/lib/db/queries";
import { computeAssessment } from "@/lib/assessment/calc";
import { GRADE_LABEL } from "@/lib/assessment/types";
import { analyzeAssessment } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireCapability("edit_appraisals");
  if (denied) return denied;
  const { coachId } = (await req.json().catch(() => ({}))) as { coachId?: number };
  if (typeof coachId !== "number") {
    return NextResponse.json({ error: "coachId is required" }, { status: 400 });
  }

  const [coach, list] = await Promise.all([getCoach(coachId), listAssessmentsForCoach(coachId)]);
  if (!coach) return NextResponse.json({ error: "not found" }, { status: 404 });
  const latest = list[0];
  if (!latest) {
    return NextResponse.json({ text: `${coach.canonicalName} has no assessment on record yet.` });
  }

  const result = computeAssessment(latest.ratings);
  const text = await analyzeAssessment({
    name: coach.canonicalName,
    totalPercent: result.totalPercent,
    finalGrade: GRADE_LABEL[result.finalGrade],
    subScores: result.parts.flatMap((p) => p.subScores),
    comments: latest.comments || undefined,
    history: list.slice(0, 6).map((a) => ({
      observedOn: new Date(a.observedOn).toISOString().slice(0, 10),
      totalPercent: a.totalPercent,
    })),
  });
  return NextResponse.json({ text });
}
