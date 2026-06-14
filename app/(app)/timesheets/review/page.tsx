import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { listTimesheetsForReview } from "@/lib/db/queries";
import { TimesheetReview } from "@/components/timesheet-review";

export const dynamic = "force-dynamic";

/** The reviewer's queue: all submitted clock-ins awaiting approval, grouped by
 *  coach. review_timesheet only. */
export default async function TimesheetReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("review_timesheet")) redirect("/timesheets");
  // Center-scoped reviewers only see their centers' queue (null = all) — must
  // match the /api/timesheets/review scoping so the SSR paint doesn't leak.
  const entries = await listTimesheetsForReview({ centers: user.managedCenters ?? undefined });
  return <TimesheetReview initialEntries={entries} />;
}
