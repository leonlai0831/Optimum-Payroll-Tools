import {
  countAppErrors,
  countLessonPlansForReview,
  countTimesheetsForReview,
} from "@/lib/db/queries";
import type { CurrentUser } from "@/lib/auth/session";
import type { Capability } from "@/lib/auth/types";

/**
 * "Attention" counts for the notification badges, keyed by the DESTINATION href
 * — the tab / page where the pending items live. Used in two places off the same
 * source of truth: the section-nav tab badges (`SectionNav`) and the launcher
 * card badges (rolled up via {@link launcherBadgeCount}).
 *
 * Each source is capability-gated for THIS user (super_admin holds the caps
 * implicitly, so it sees them all; errors are super_admin-only) and best-effort:
 * a failing count must never take down the nav or the launcher, so it degrades
 * to 0. Only positive counts are returned. The three counts run in parallel.
 */
export async function attentionBadges(
  user: CurrentUser,
  caps: Set<Capability>,
): Promise<Record<string, number>> {
  const isSuperAdmin = user.role === "super_admin";
  // Center-scoped reviewers only count their centers' pending items (null = all),
  // so the badge matches the queue they'll actually see.
  const centers = user.managedCenters ?? undefined;
  const [timesheets, lessonPlans, errors] = await Promise.all([
    caps.has("review_timesheet") ? safeCount(() => countTimesheetsForReview(undefined, centers)) : 0,
    caps.has("review_lesson_plans") ? safeCount(() => countLessonPlansForReview(centers)) : 0,
    isSuperAdmin ? safeCount(countAppErrors) : 0,
  ]);
  const out: Record<string, number> = {};
  if (timesheets > 0) out["/timesheets/review"] = timesheets;
  if (lessonPlans > 0) out["/lesson-plans/history"] = lessonPlans;
  if (errors > 0) out["/system/errors"] = errors;
  return out;
}

/** Which destination href(s) roll up onto each launcher CARD. A card shows the
 *  sum of its section's attention counts (its tab inside the section then shows
 *  the per-destination breakdown). */
const LAUNCHER_BADGE_HREFS: Record<string, readonly string[]> = {
  "/timesheets": ["/timesheets/review"],
  "/lesson-plans/history": ["/lesson-plans/history"],
  "/system/users": ["/system/errors"],
};

/** Sum the attention counts that belong to a launcher card's section. */
export function launcherBadgeCount(
  cardHref: string | undefined,
  badges: Record<string, number>,
): number {
  if (!cardHref) return 0;
  const hrefs = LAUNCHER_BADGE_HREFS[cardHref] ?? [];
  return hrefs.reduce((sum, href) => sum + (badges[href] ?? 0), 0);
}

async function safeCount(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch {
    return 0;
  }
}
