import { describe, it, expect } from "vitest";
import { canViewPlan, type LessonPlanAccess } from "@/lib/lesson-plan/access";
import type { CurrentUser } from "@/lib/auth/session";

/** Minimal CurrentUser for the pure access checks. */
function user(id: number, managedCenters: string[] | null): CurrentUser {
  return {
    id,
    email: `u${id}@x`,
    displayName: `U${id}`,
    role: "supervisor",
    managedCenters,
  } as CurrentUser;
}

function access(opts: {
  id: number;
  canEdit: boolean;
  canReview: boolean;
  managedCenters: string[] | null;
}): LessonPlanAccess {
  return {
    user: user(opts.id, opts.managedCenters),
    canEdit: opts.canEdit,
    canReview: opts.canReview,
  };
}

describe("canViewPlan center scoping", () => {
  const plan = { createdByUserId: 99, center: "Subang USJ" };

  it("lets the creator view their own plan regardless of center scope", () => {
    const a = access({ id: 99, canEdit: true, canReview: false, managedCenters: ["HQ"] });
    expect(canViewPlan(a, plan)).toBe(true);
  });

  it("lets an unrestricted reviewer (managedCenters null) view any center", () => {
    const a = access({ id: 1, canEdit: false, canReview: true, managedCenters: null });
    expect(canViewPlan(a, plan)).toBe(true);
  });

  it("lets a scoped reviewer view a plan inside their center", () => {
    const a = access({ id: 1, canEdit: false, canReview: true, managedCenters: ["Subang USJ"] });
    expect(canViewPlan(a, plan)).toBe(true);
  });

  it("BLOCKS a scoped reviewer from a plan outside their center (the IDOR fix)", () => {
    const a = access({ id: 1, canEdit: false, canReview: true, managedCenters: ["HQ"] });
    expect(canViewPlan(a, plan)).toBe(false);
  });

  it("matches center case-insensitively / trimmed", () => {
    const a = access({ id: 1, canEdit: false, canReview: true, managedCenters: ["  subang usj "] });
    expect(canViewPlan(a, plan)).toBe(true);
  });

  it("lets a scoped reviewer who is ALSO the creator view their own out-of-center plan", () => {
    const a = access({ id: 99, canEdit: true, canReview: true, managedCenters: ["HQ"] });
    expect(canViewPlan(a, plan)).toBe(true);
  });

  it("denies an editor (non-creator, no review) regardless of center", () => {
    const a = access({ id: 1, canEdit: true, canReview: false, managedCenters: null });
    expect(canViewPlan(a, plan)).toBe(false);
  });
});
