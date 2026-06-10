import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite for tests (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

import { emptyLessonPlanData, type LessonPlanData, type LessonPlanType } from "./types";

function makeData(overrides: Partial<LessonPlanData> = {}): LessonPlanData {
  return { ...emptyLessonPlanData(), ...overrides };
}

describe("Lesson plan DB layer (PGlite in-memory)", () => {
  let queries: typeof import("../db/queries");

  beforeAll(async () => {
    queries = await import("../db/queries");
  });

  function makePlan(
    overrides: Partial<Parameters<typeof queries.createLessonPlan>[0]> = {},
  ): Promise<import("../db/schema").LessonPlanRecord> {
    return queries.createLessonPlan({
      type: "actual" as LessonPlanType,
      createdByUserId: 1,
      createdByName: "Coach One",
      coachId: null,
      instructorName: "COACH ONE",
      actualInstructorName: "",
      center: "HQ",
      lessonDate: new Date("2026-06-15T00:00:00Z"),
      timeLabel: "5.00pm",
      levelType: null,
      classLevel: "2",
      ageGroup: "5-7",
      data: makeData({ objectives: ["Kick 5m", "", ""] }),
      ...overrides,
    });
  }

  it("creates a draft and walks the full review workflow", async () => {
    const plan = await makePlan();
    expect(plan.id).toBeGreaterThan(0);
    expect(plan.status).toBe("draft");

    // draft → submitted
    await queries.submitLessonPlan(plan.id);
    expect((await queries.getLessonPlan(plan.id))!.status).toBe("submitted");

    // submitted → approved (reviewer attribution recorded)
    await queries.reviewLessonPlan(plan.id, "approve", "Looks great", {
      email: "reviewer@opt.page",
    });
    const approved = (await queries.getLessonPlan(plan.id))!;
    expect(approved.status).toBe("approved");
    expect(approved.reviewNote).toBe("Looks great");
    expect(approved.reviewedByEmail).toBe("reviewer@opt.page");
    expect(approved.reviewedAt).toBeInstanceOf(Date);
  });

  it("resets an approved plan to draft on any content edit, keeping the review note", async () => {
    const plan = await makePlan();
    await queries.submitLessonPlan(plan.id);
    await queries.reviewLessonPlan(plan.id, "approve", "Approved as-is", {
      email: "reviewer@opt.page",
    });

    await queries.updateLessonPlan(plan.id, {
      instructorName: "COACH ONE",
      actualInstructorName: "",
      center: "USJ",
      lessonDate: new Date("2026-06-16T00:00:00Z"),
      timeLabel: "6.00pm",
      levelType: null,
      classLevel: "3",
      ageGroup: "5-7",
      data: makeData({ priorKnowledge: "Edited after approval" }),
    });
    const edited = (await queries.getLessonPlan(plan.id))!;
    expect(edited.status).toBe("draft"); // edit-after-approval resets to draft
    expect(edited.center).toBe("USJ");
    expect(edited.data.priorKnowledge).toBe("Edited after approval");
    // The last review note (and reviewer) stay visible through the reset.
    expect(edited.reviewNote).toBe("Approved as-is");
    expect(edited.reviewedByEmail).toBe("reviewer@opt.page");

    // The corrected plan can be resubmitted.
    await queries.submitLessonPlan(plan.id);
    expect((await queries.getLessonPlan(plan.id))!.status).toBe("submitted");
  });

  it("request_changes records the note and the plan can be resubmitted", async () => {
    const plan = await makePlan({ type: "replacement", levelType: "medium", instructorName: "SUB COACH", actualInstructorName: "COACH ONE" });
    await queries.submitLessonPlan(plan.id);
    await queries.reviewLessonPlan(plan.id, "request_changes", "Add a Warm Up time", {
      email: "reviewer@opt.page",
    });
    const sentBack = (await queries.getLessonPlan(plan.id))!;
    expect(sentBack.status).toBe("changes_requested");
    expect(sentBack.reviewNote).toBe("Add a Warm Up time");

    await queries.submitLessonPlan(plan.id);
    expect((await queries.getLessonPlan(plan.id))!.status).toBe("submitted");
  });

  it("lists own-only with forUserId and everything without, newest lesson first", async () => {
    const mine = await makePlan({
      createdByUserId: 101,
      instructorName: "MINE NEWER",
      lessonDate: new Date("2026-07-20T00:00:00Z"),
    });
    await makePlan({
      createdByUserId: 101,
      instructorName: "MINE OLDER",
      lessonDate: new Date("2026-07-01T00:00:00Z"),
    });
    const theirs = await makePlan({
      createdByUserId: 202,
      instructorName: "THEIRS",
      lessonDate: new Date("2026-07-10T00:00:00Z"),
    });

    const own = await queries.listLessonPlans({ forUserId: 101 });
    expect(own.map((r) => r.instructorName)).toEqual(["MINE NEWER", "MINE OLDER"]);
    expect(own.some((r) => r.id === theirs.id)).toBe(false);

    const all = await queries.listLessonPlans();
    expect(all.some((r) => r.id === mine.id)).toBe(true);
    expect(all.some((r) => r.id === theirs.id)).toBe(true);
    // Ordered by lesson date desc across creators.
    const julyIds = all.filter((r) => ["MINE NEWER", "THEIRS", "MINE OLDER"].includes(r.instructorName));
    expect(julyIds.map((r) => r.instructorName)).toEqual(["MINE NEWER", "THEIRS", "MINE OLDER"]);
    // The list projection never carries the jsonb body.
    expect("data" in all[0]).toBe(false);
  });

  it("deletes a plan", async () => {
    const plan = await makePlan();
    await queries.deleteLessonPlan(plan.id);
    expect(await queries.getLessonPlan(plan.id)).toBeUndefined();
  });

  it("backfills the lesson-plan capabilities onto stored matrices per role defaults", async () => {
    const normalized = queries.normalizePermissionConfig({
      admin: ["run_kpi"],
      supervisor: ["run_kpi"],
      staff: ["view_own"],
    });
    // edit_lesson_plans → staff + supervisor + admin; review_lesson_plans → supervisor + admin.
    expect(normalized.admin).toContain("edit_lesson_plans");
    expect(normalized.admin).toContain("review_lesson_plans");
    expect(normalized.supervisor).toContain("edit_lesson_plans");
    expect(normalized.supervisor).toContain("review_lesson_plans");
    expect(normalized.staff).toContain("edit_lesson_plans");
    expect(normalized.staff).not.toContain("review_lesson_plans");
  });
});

describe("canDeletePlan", () => {
  it("creator only while draft; admin and super_admin at any status", async () => {
    const { canDeletePlan } = await import("./access");
    const user = (role: string, id = 1) =>
      ({ user: { id, role }, canEdit: true, canReview: false }) as Parameters<
        typeof canDeletePlan
      >[0];
    const plan = (createdByUserId: number, status: string) => ({ createdByUserId, status });

    // Creator: draft only.
    expect(canDeletePlan(user("staff"), plan(1, "draft"))).toBe(true);
    expect(canDeletePlan(user("staff"), plan(1, "submitted"))).toBe(false);
    expect(canDeletePlan(user("staff"), plan(1, "approved"))).toBe(false);
    // Not the creator, not admin: never.
    expect(canDeletePlan(user("supervisor", 2), plan(1, "draft"))).toBe(false);
    // Admin / super_admin: any plan, any status.
    expect(canDeletePlan(user("admin", 2), plan(1, "approved"))).toBe(true);
    expect(canDeletePlan(user("super_admin", 2), plan(1, "submitted"))).toBe(true);
  });
});
