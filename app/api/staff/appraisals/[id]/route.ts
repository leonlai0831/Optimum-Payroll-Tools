import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteAppraisal, recordAudit, updateAppraisal } from "@/lib/db/queries";
import {
  RATING_MAX,
  RATING_MIN,
  overallFromRatings,
  type AppraisalRating,
} from "@/lib/performance/types";

const clampScore = (n: number) =>
  Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(Number.isFinite(n) ? n : RATING_MIN)));

export async function PATCH(req: Request, ctx: RouteContext<"/api/staff/appraisals/[id]">) {
  const denied = await requireCapability("edit_appraisals");
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    periodLabel?: string;
    reviewDate?: string;
    comments?: string;
    ratings?: { key?: string; label?: string; score?: number }[];
  };

  const patch: Parameters<typeof updateAppraisal>[1] = {};
  if (typeof body.periodLabel === "string") patch.periodLabel = body.periodLabel.trim();
  if (typeof body.comments === "string") patch.comments = body.comments.trim();
  if (body.reviewDate) {
    const d = new Date(body.reviewDate);
    if (!Number.isNaN(d.getTime())) patch.reviewDate = d;
  }
  if (Array.isArray(body.ratings)) {
    const ratings: AppraisalRating[] = body.ratings
      .filter((r) => r && typeof r.key === "string")
      .map((r) => ({
        key: String(r.key),
        label: String(r.label ?? r.key),
        score: clampScore(Number(r.score)),
      }));
    patch.ratings = ratings;
    patch.overallScore = overallFromRatings(ratings);
  }

  await updateAppraisal(Number(id), patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/staff/appraisals/[id]">) {
  const denied = await requireCapability("edit_appraisals");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await ctx.params;
  await deleteAppraisal(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "appraisal.delete",
      entity: "appraisal",
      entityId: id,
      summary: `Deleted appraisal #${id}`,
    });
  }
  return NextResponse.json({ ok: true });
}
