import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { canManageCenter } from "@/lib/auth/types";

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

/**
 * Whether this user may open the plan: its creator always, or a reviewer **only
 * for a center they manage**. A center-scoped reviewer (`managedCenters` set)
 * must not read/export plans outside their centers — the list query already
 * filters by center, so without this gate a restricted reviewer could fetch any
 * plan by id (the GET / PDF routes). `managedCenters === null` = unrestricted
 * (and super_admin), so they keep full access.
 */
export function canViewPlan(
  access: LessonPlanAccess,
  plan: { createdByUserId: number; center: string | null },
): boolean {
  if (access.canEdit && plan.createdByUserId === access.user.id) return true;
  return access.canReview && canManageCenter(access.user.managedCenters, plan.center);
}

/** Whether this user may edit / submit the plan: its creator only. */
export function isPlanCreator(
  access: LessonPlanAccess,
  plan: { createdByUserId: number },
): boolean {
  return access.canEdit && plan.createdByUserId === access.user.id;
}

/**
 * Whether this user may delete the plan: its creator while it is still a
 * draft, or an admin / super_admin at any status (cleanup of stale or
 * mis-filed plans — audited in the route).
 */
export function canDeletePlan(
  access: LessonPlanAccess,
  plan: { createdByUserId: number; status: string },
): boolean {
  if (access.user.role === "admin" || access.user.role === "super_admin") return true;
  return isPlanCreator(access, plan) && plan.status === "draft";
}
