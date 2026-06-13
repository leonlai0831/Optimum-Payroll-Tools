import { NextResponse } from "next/server";
import { createTimesheetEntry, listTimesheetsForCoach } from "@/lib/db/queries";
import { timesheetAccess } from "@/lib/timesheet/access";
import { parsePeriod, parseTimesheetEntry } from "@/lib/timesheet/validate";

export const dynamic = "force-dynamic";

/**
 * List timesheet entries. Default = the caller's OWN entries (their linked
 * coach profile). `?coachId=N` scopes to that coach — reviewers / schedule
 * managers only. `?period=YYYY-MM` filters to one work month.
 */
export async function GET(req: Request) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { user, canReview, canManageSchedule } = gate.access;
  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? undefined;
  const coachIdParam = url.searchParams.get("coachId");

  let coachId: number | null;
  if (coachIdParam != null) {
    if (!canReview && !canManageSchedule) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    coachId = Number(coachIdParam);
    if (!Number.isInteger(coachId)) {
      return NextResponse.json({ error: "coachId must be an integer" }, { status: 400 });
    }
  } else {
    coachId = user.coachId;
    if (coachId == null) return NextResponse.json({ entries: [] });
  }
  return NextResponse.json({ entries: await listTimesheetsForCoach(coachId, period) });
}

/** Create one OWN clock-in entry (always lands as a draft). */
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
  const parsed = parseTimesheetEntry(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await createTimesheetEntry({ coachId: user.coachId, periodLabel: period, ...parsed.value });
  return NextResponse.json({ ok: true, id: row.id });
}
