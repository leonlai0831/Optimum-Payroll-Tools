import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createAppraisal, getPerformanceConfig } from "@/lib/db/queries";
import {
  RATING_MAX,
  RATING_MIN,
  overallFromRatings,
  type AppraisalRating,
} from "@/lib/performance/types";

const clampScore = (n: number) =>
  Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(Number.isFinite(n) ? n : RATING_MIN)));

export async function POST(req: Request, ctx: RouteContext<"/api/staff/[id]/appraisals">) {
  const denied = await requireCapability("edit_appraisals");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const coachId = Number(id);
  const body = (await req.json().catch(() => ({}))) as {
    periodLabel?: string;
    reviewDate?: string;
    comments?: string;
    ratings?: { key?: string; score?: number }[];
  };

  // Snapshot the current dimensions with the supplied scores.
  const config = await getPerformanceConfig();
  const provided = new Map<string, number>();
  if (Array.isArray(body.ratings)) {
    for (const r of body.ratings) {
      if (r && typeof r.key === "string") provided.set(r.key, clampScore(Number(r.score)));
    }
  }
  const ratings: AppraisalRating[] = config.dimensions.map((d) => ({
    key: d.key,
    label: d.label,
    score: provided.get(d.key) ?? RATING_MIN,
  }));

  const parsedDate = body.reviewDate ? new Date(body.reviewDate) : new Date();
  await createAppraisal({
    coachId,
    periodLabel: String(body.periodLabel ?? "").trim(),
    reviewDate: Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate,
    reviewedBy: actor.email,
    ratings,
    overallScore: overallFromRatings(ratings),
    comments: String(body.comments ?? "").trim(),
  });
  return NextResponse.json({ ok: true });
}
