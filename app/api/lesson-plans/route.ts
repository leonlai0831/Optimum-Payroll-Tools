import { NextResponse } from "next/server";
import { createLessonPlan, listLessonPlans } from "@/lib/db/queries";
import { lessonPlanAccess } from "@/lib/lesson-plan/access";
import { LESSON_PLAN_TYPES, type LessonPlanType } from "@/lib/lesson-plan/types";
import { parseLessonPlanContent, type LessonPlanContentBody } from "@/lib/lesson-plan/validate";

export const dynamic = "force-dynamic";

/** List lesson plans: reviewers see all, editors see only their own. */
export async function GET() {
  const gate = await lessonPlanAccess();
  if ("error" in gate) return gate.error;
  const { user, canReview } = gate.access;
  const plans = await listLessonPlans(canReview ? {} : { forUserId: user.id });
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
