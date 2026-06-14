import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { createLessonPlan, listLessonPlans } from "@/lib/db/queries";
import { lessonPlanAccess } from "@/lib/lesson-plan/access";
import { LESSON_PLAN_TYPES, type LessonPlanType } from "@/lib/lesson-plan/types";
import { parseLessonPlanContent, type LessonPlanContentBody } from "@/lib/lesson-plan/validate";

export const dynamic = "force-dynamic";

/**
 * List lesson plans: reviewers see all, editors see only their own.
 *
 * With `?coachId=N` the list is instead scoped to that coach's plans — this
 * powers the assessment form's lesson-plan picker, so it is allowed for
 * `review_lesson_plans` OR `edit_appraisals` holders (an assessor must see the
 * assessed coach's plans even without lesson-plan review rights).
 */
export async function GET(req: Request) {
  const coachIdParam = new URL(req.url).searchParams.get("coachId");
  if (coachIdParam != null) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const allowed =
      (await userCan(user, "review_lesson_plans")) || (await userCan(user, "edit_appraisals"));
    if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const coachId = Number(coachIdParam);
    if (!Number.isInteger(coachId)) {
      return NextResponse.json({ error: "coachId must be an integer" }, { status: 400 });
    }
    return NextResponse.json({ plans: await listLessonPlans({ coachId }) });
  }

  const gate = await lessonPlanAccess();
  if ("error" in gate) return gate.error;
  const { user, canReview } = gate.access;
  // Reviewers see all plans, narrowed to their managed centers when scoped
  // (null = all); editors always see their own, regardless of center.
  const plans = await listLessonPlans(
    canReview ? { centers: user.managedCenters ?? undefined } : { forUserId: user.id },
  );
  return NextResponse.json({ plans });
}

/** Create a new plan (always lands as a draft). */
export async function POST(req: Request) {
  const gate = await lessonPlanAccess();
  if ("error" in gate) return gate.error;
  const { user, canEdit } = gate.access;
  if (!canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as LessonPlanContentBody & { type?: unknown };
  if (!(LESSON_PLAN_TYPES as readonly string[]).includes(String(body.type))) {
    return NextResponse.json({ error: "type must be 'actual' or 'replacement'" }, { status: 400 });
  }
  const type = body.type as LessonPlanType;
  // The instructor (replacement instructor on a replacement plan) is always the
  // person filling the form — server truth, never client input.
  body.instructorName = user.displayName || user.email;
  const parsed = parseLessonPlanContent(type, body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await createLessonPlan({
    ...parsed.content,
    type,
    createdByUserId: user.id,
    createdByName: user.displayName || user.email,
    coachId: user.coachId,
  });
  return NextResponse.json({ ok: true, id: row.id });
}
