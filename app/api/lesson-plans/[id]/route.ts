import { NextResponse } from "next/server";
import {
  deleteLessonPlan,
  getLessonPlan,
  recordAudit,
  submitLessonPlan,
  updateLessonPlan,
} from "@/lib/db/queries";
import { canDeletePlan, canViewPlan, isPlanCreator, lessonPlanAccess } from "@/lib/lesson-plan/access";
import { parseLessonPlanContent, type LessonPlanContentBody } from "@/lib/lesson-plan/validate";

export const dynamic = "force-dynamic";

/** Read one full plan (creator or any reviewer). */
export async function GET(_req: Request, ctx: RouteContext<"/api/lesson-plans/[id]">) {
  const gate = await lessonPlanAccess();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const plan = await getLessonPlan(Number(id));
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canViewPlan(gate.access, plan)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ plan });
}

/**
 * Creator-only mutations:
 *  - `{ action: "submit" }` moves a draft / changes-requested plan into review;
 *  - any other body is a content edit, which always resets the status to draft
 *    (the last review note stays visible on the plan).
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/lesson-plans/[id]">) {
  const gate = await lessonPlanAccess();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const plan = await getLessonPlan(Number(id));
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!isPlanCreator(gate.access, plan)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as LessonPlanContentBody & { action?: unknown };
  // The instructor (replacement instructor on a replacement plan) is always the
  // person filling the form — server truth, never client input.
  const { user } = gate.access;
  body.instructorName = user.displayName || user.email;

  if (body.action === "submit") {
    if (plan.status !== "draft" && plan.status !== "changes_requested") {
      return NextResponse.json(
        { error: "Only a draft or changes-requested plan can be submitted" },
        { status: 409 },
      );
    }
    await submitLessonPlan(plan.id);
    return NextResponse.json({ ok: true, status: "submitted" });
  }

  const parsed = parseLessonPlanContent(plan.type, body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await updateLessonPlan(plan.id, parsed.content);
  return NextResponse.json({ ok: true, status: "draft" });
}

/** Delete a plan — its creator while a draft, or an admin at any status. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/lesson-plans/[id]">) {
  const gate = await lessonPlanAccess();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const plan = await getLessonPlan(Number(id));
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canDeletePlan(gate.access, plan)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await deleteLessonPlan(plan.id);
  const { user } = gate.access;
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "lesson_plan.delete",
    entity: "lesson_plan",
    entityId: plan.id,
    summary: `Deleted ${plan.type} lesson plan #${plan.id} (${plan.instructorName}, ${plan.lessonDate.toISOString().slice(0, 10)})`,
  });
  return NextResponse.json({ ok: true });
}
