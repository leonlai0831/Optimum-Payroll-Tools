import { getCurrentUser } from "@/lib/auth/session";
import { listTimesheetsForCoach } from "@/lib/db/queries";
import { TimesheetEntry } from "@/components/timesheet-entry";

export const dynamic = "force-dynamic";

/** The current work month as "YYYY-MM" in the operator's timezone (Asia/KL). */
function currentPeriod(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}-${m}`;
}

/** The clock-in entry surface — each person logs (and submits) their own month.
 *  The first month is fetched here (server) and passed as props, so the client
 *  never fetches on mount; it re-fetches only when the user changes month/acts. */
export default async function TimesheetsPage() {
  const user = await getCurrentUser();
  const period = currentPeriod();
  const entries =
    user?.coachId != null
      ? (await listTimesheetsForCoach(user.coachId, period)).map((e) => ({
          id: e.id,
          date: e.date,
          center: e.center,
          entryType: e.entryType,
          classType: e.classType,
          startTime: e.startTime,
          endTime: e.endTime,
          hours: e.hours,
          status: e.status,
          reviewNote: e.reviewNote,
        }))
      : [];
  return (
    <TimesheetEntry
      hasCoachProfile={user?.coachId != null}
      initialPeriod={period}
      initialEntries={entries}
    />
  );
}
