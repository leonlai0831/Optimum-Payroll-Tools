import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getLessonPlan, recordAudit, reviewLessonPlan } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Review a submitted plan: approve it, or send it back with a note (the note is
 * required when requesting changes). Reviewer-only; reviewing one's own plan is
 * allowed.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/lesson-plans/[id]/review">) {
  const denied = await requireCapability("review_lesson_plans");
  if (denied) return denied;
  const user = (await getCurrentUser())!;

  const { id } = await ctx.params;
  const plan = await getLessonPlan(Number(id));
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (plan.status !== "submitted") {
    return NextResponse.json({ error: "Only a submitted plan can be reviewed" }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; note?: unknown };
  const action = body.action;
  if (action !== "approve" && action !== "request_changes") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'request_changes'" },
      { status: 400 },
    );
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (action === "request_changes" && !note) {
    return NextResponse.json(
      { error: "A note is required when requesting changes" },
      { status: 400 },
    );
  }

  await reviewLessonPlan(plan.id, action, note, { email: user.email });
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "lesson_plan.review",
    entity: "lesson_plan",
    entityId: plan.id,
    summary: `${action === "approve" ? "Approved" : "Requested changes on"} ${plan.type} lesson plan #${plan.id} (${plan.instructorName})`,
  });
  return NextResponse.json({ ok: true, status: action === "approve" ? "approved" : "changes_requested" });
}
