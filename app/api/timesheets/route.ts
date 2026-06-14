import { NextResponse } from "next/server";
import {
  createTimesheetEntry,
  deleteTimesheetEntries,
  getTimesheetEntry,
  listTimesheetsForCoach,
} from "@/lib/db/queries";
import { timesheetAccess } from "@/lib/timesheet/access";
import {
  parsePeriod,
  parseTimesheetEntry,
  parseTimesheetSession,
  sessionToEntries,
} from "@/lib/timesheet/validate";

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

  // A lesson SESSION (`lines` present) = a clocked start–end window with one or
  // more (classType, hours) lines; it persists as one lesson row per line sharing
  // the window. Everything else (front-desk shift, or a legacy single entry) goes
  // through parseTimesheetEntry.
  if (Array.isArray(body.lines)) {
    const parsed = parseTimesheetSession(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const ids: number[] = [];
    for (const entry of sessionToEntries(parsed.value)) {
      const row = await createTimesheetEntry({ coachId: user.coachId, periodLabel: period, ...entry });
      ids.push(row.id);
    }
    return NextResponse.json({ ok: true, ids });
  }

  const parsed = parseTimesheetEntry(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const row = await createTimesheetEntry({ coachId: user.coachId, periodLabel: period, ...parsed.value });
  return NextResponse.json({ ok: true, id: row.id });
}

/**
 * Delete a whole clocked window at once — the per-line rows of one lesson
 * session share (date, center, start, end) and are deleted together. Body:
 * `{ ids: number[] }`. Each id is re-checked against the same rule as the
 * single delete (own draft, or a reviewer acting on anyone's entry); stale or
 * out-of-scope ids are silently dropped so a partial id set can't half-delete.
 */
export async function DELETE(req: Request) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { access } = gate;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => Number.isInteger(x)) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty integer array" }, { status: 400 });
  }

  const allowed: number[] = [];
  for (const id of ids) {
    const entry = await getTimesheetEntry(id);
    if (!entry) continue;
    const ownDraft =
      access.canSubmit && access.user.coachId === entry.coachId && entry.status === "draft";
    if (ownDraft || access.canReview) allowed.push(entry.id);
  }
  const deleted = await deleteTimesheetEntries(allowed);
  return NextResponse.json({ ok: true, deleted });
}
