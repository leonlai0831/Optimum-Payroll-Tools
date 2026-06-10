import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import { emptyLessonPlanData } from "../lesson-plan/types";
import type { GradeKey } from "./types";

describe("Assessment ↔ lesson-plan link (PGlite in-memory)", () => {
  let queries: typeof import("../db/queries");

  beforeAll(async () => {
    queries = await import("../db/queries");
  });

  function makePlan(coachId: number | null) {
    return queries.createLessonPlan({
      type: "replacement",
      createdByUserId: 1,
      createdByName: "Coach One",
      coachId,
      instructorName: "COACH ONE",
      actualInstructorName: "COACH TWO",
      center: "QSM",
      lessonDate: new Date("2026-06-10T00:00:00Z"),
      timeLabel: "5.00pm",
      levelType: "medium",
      classLevel: "3",
      ageGroup: "",
      data: emptyLessonPlanData(),
    });
  }

  function makeAssessment(coachId: number, lessonPlanId: number | null) {
    return queries.createAssessment({
      coachId,
      observedOn: new Date("2026-06-10T00:00:00Z"),
      assessor: "QA",
      classType: "LTS",
      poolType: "Indoor",
      pax: 4,
      levels: [],
      hasHelper: false,
      ratings: {},
      totalPercent: 80,
      finalGrade: "B" as GradeKey,
      comments: "",
      lessonPlanId,
    });
  }

  it("round-trips a valid link on create", async () => {
    const plan = await makePlan(55);
    const check = await queries.validateAssessmentLessonPlanLink(plan.id, 55);
    expect(check.ok).toBe(true);

    const row = await makeAssessment(55, plan.id);
    expect(row.lessonPlanId).toBe(plan.id);
    const fetched = (await queries.getAssessment(row.id))!;
    expect(fetched.lessonPlanId).toBe(plan.id);
    // The recent list carries the link too.
    const recent = await queries.listRecentAssessments();
    expect(recent.find((r) => r.id === row.id)!.lessonPlanId).toBe(plan.id);
  });

  it("rejects a mismatched or missing plan at the validation helper", async () => {
    const plan = await makePlan(55);
    // Plan belongs to coach 55, assessment is for coach 99 → reject.
    const mismatch = await queries.validateAssessmentLessonPlanLink(plan.id, 99);
    expect(mismatch).toEqual({ ok: false, error: "lesson plan belongs to a different coach" });
    // A plan with no coach profile can never be linked.
    const orphan = await makePlan(null);
    expect((await queries.validateAssessmentLessonPlanLink(orphan.id, 55)).ok).toBe(false);
    // Nonexistent plan id → reject.
    const missing = await queries.validateAssessmentLessonPlanLink(999999, 55);
    expect(missing).toEqual({ ok: false, error: "lesson plan not found" });
  });

  it("lists assessments by lessonPlanId (and stores null when unlinked)", async () => {
    const plan = await makePlan(77);
    const linked = await makeAssessment(77, plan.id);
    const unlinked = await makeAssessment(77, null);
    expect(unlinked.lessonPlanId).toBeNull();

    const forPlan = await queries.listAssessmentsForLessonPlan(plan.id);
    expect(forPlan.map((a) => a.id)).toEqual([linked.id]);
    expect(await queries.listAssessmentsForLessonPlan(999999)).toEqual([]);
  });

  it("filters the lesson-plan list by coachId for the picker", async () => {
    const mine = await makePlan(301);
    await makePlan(302);
    const rows = await queries.listLessonPlans({ coachId: 301 });
    expect(rows.map((r) => r.id)).toEqual([mine.id]);
  });
});
