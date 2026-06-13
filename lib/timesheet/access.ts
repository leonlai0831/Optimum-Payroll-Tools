import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";

/**
 * Timesheet capabilities resolved once per request:
 *  - `submit_timesheet`         — create / edit / submit one's OWN entries.
 *  - `review_timesheet`         — see everyone's entries + review (P3).
 *  - `manage_freelancer_schedule` — maintain freelancers' fixed schedules.
 * super_admin implicitly holds all three.
 */
export interface TimesheetAccess {
  user: CurrentUser;
  canSubmit: boolean;
  canReview: boolean;
  canManageSchedule: boolean;
}

/**
 * Route-handler gate: resolves the current user's timesheet capabilities, or a
 * 401/403 to short-circuit with when they hold none. Usage:
 *   const gate = await timesheetAccess();
 *   if ("error" in gate) return gate.error;
 */
export async function timesheetAccess(): Promise<
  { access: TimesheetAccess } | { error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const [canSubmit, canReview, canManageSchedule] = await Promise.all([
    userCan(user, "submit_timesheet"),
    userCan(user, "review_timesheet"),
    userCan(user, "manage_freelancer_schedule"),
  ]);
  if (!canSubmit && !canReview && !canManageSchedule) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { access: { user, canSubmit, canReview, canManageSchedule } };
}

/** Is `coachId` the user's own coach profile? (own-entry scoping). */
export function isOwnCoach(access: TimesheetAccess, coachId: number): boolean {
  return access.user.coachId != null && access.user.coachId === coachId;
}

/** May this user create/edit/submit an entry for `coachId`? Own entries only,
 *  unless they hold review rights (an admin correcting on someone's behalf). */
export function canEditEntry(access: TimesheetAccess, coachId: number): boolean {
  return (access.canSubmit && isOwnCoach(access, coachId)) || access.canReview;
}
