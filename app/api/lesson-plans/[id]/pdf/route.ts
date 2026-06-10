import { NextResponse } from "next/server";
import { getLessonPlan } from "@/lib/db/queries";
import { canViewPlan, lessonPlanAccess } from "@/lib/lesson-plan/access";
import { buildLessonPlanPdf } from "@/lib/reports/lesson-plan";

export const dynamic = "force-dynamic";

/** Download one plan as a PDF (anyone who can open the plan can export it). */
export async function GET(_req: Request, ctx: RouteContext<"/api/lesson-plans/[id]/pdf">) {
  const gate = await lessonPlanAccess();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const plan = await getLessonPlan(Number(id));
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canViewPlan(gate.access, plan)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pdf = await buildLessonPlanPdf({
    type: plan.type,
    status: plan.status,
    createdByName: plan.createdByName,
    instructorName: plan.instructorName,
    actualInstructorName: plan.actualInstructorName,
    center: plan.center,
    lessonDate: plan.lessonDate,
    timeLabel: plan.timeLabel,
    levelType: plan.levelType,
    classLevel: plan.classLevel,
    ageGroup: plan.ageGroup,
    data: plan.data,
  });

  const slug =
    plan.instructorName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "") || "instructor";
  const filename = `lesson-plan-${plan.type}-${slug}-${plan.lessonDate.toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
