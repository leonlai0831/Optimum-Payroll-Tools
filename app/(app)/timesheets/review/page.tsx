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
  const entries = await listTimesheetsForReview({});
  return <TimesheetReview initialEntries={entries} />;
}
