import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";

/**
 * The two lesson-plan capabilities resolved once per request. Visibility rules:
 * editors (`edit_lesson_plans`) see only their OWN plans; reviewers
 * (`review_lesson_plans`) see all. Only the creator edits / submits / deletes;
 * only reviewers approve or request changes (a reviewer reviewing their own
 * plan is allowed). super_admin implicitly holds both capabilities.
 */
export interface LessonPlanAccess {
  user: CurrentUser;
  canEdit: boolean;
  canReview: boolean;
}

/**
 * Route-handler gate: resolves the current user's lesson-plan capabilities, or
 * a 401/403 response to short-circuit with when they hold neither. Usage:
 *   const gate = await lessonPlanAccess();
 *   if ("error" in gate) return gate.error;
 */
export async function lessonPlanAccess(): Promise<
  { access: LessonPlanAccess } | { error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const [canEdit, canReview] = await Promise.all([
    userCan(user, "edit_lesson_plans"),
    userCan(user, "review_lesson_plans"),
  ]);
  if (!canEdit && !canReview) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { access: { user, canEdit, canReview } };
}

/** Whether this user may open the plan: its creator, or any reviewer. */
export function canViewPlan(
  access: LessonPlanAccess,
  plan: { createdByUserId: number },
): boolean {
  return access.canReview || (access.canEdit && plan.createdByUserId === access.user.id);
}

/** Whether this user may edit / submit / delete the plan: its creator only. */
export function isPlanCreator(
  access: LessonPlanAccess,
  plan: { createdByUserId: number },
): boolean {
  return access.canEdit && plan.createdByUserId === access.user.id;
}
