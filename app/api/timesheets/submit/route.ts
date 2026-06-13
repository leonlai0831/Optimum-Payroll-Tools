import { NextResponse } from "next/server";
import { recordAudit, submitTimesheetsForPeriod } from "@/lib/db/queries";
import { timesheetAccess } from "@/lib/timesheet/access";
import { parsePeriod } from "@/lib/timesheet/validate";

export const dynamic = "force-dynamic";

/** Submit the caller's OWN month: flip every draft / changes_requested entry
 *  for that work month to submitted. */
export async function POST(req: Request) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { user, canSubmit } = gate.access;
  if (!canSubmit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (user.coachId == null) {
    return NextResponse.json(
      { error: "your account is not linked to a coach profile" },
      { status: 409 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const period = parsePeriod(body.periodLabel);
  if (!period) return NextResponse.json({ error: "periodLabel must be YYYY-MM" }, { status: 400 });

  const count = await submitTimesheetsForPeriod(user.coachId, period);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "timesheet.submit",
    entity: "timesheet",
    entityId: null,
    summary: `Submitted ${count} timesheet ${count === 1 ? "entry" : "entries"} for ${period}`,
  });
  return NextResponse.json({ ok: true, submitted: count });
}
