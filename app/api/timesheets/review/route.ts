import { NextResponse } from "next/server";
import { listTimesheetsForReview, recordAudit, reviewTimesheets } from "@/lib/db/queries";
import { timesheetAccess } from "@/lib/timesheet/access";
import { parsePeriod } from "@/lib/timesheet/validate";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "submitted", "approved", "changes_requested"] as const;

/** The reviewer's queue across all coaches (default: `submitted`).
 *  `review_timesheet` only. */
export async function GET(req: Request) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  if (!gate.access.canReview) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period")) ?? undefined;
  const statusParam = url.searchParams.get("status");
  const status = (STATUSES as readonly string[]).includes(statusParam ?? "")
    ? (statusParam as (typeof STATUSES)[number])
    : undefined;
  return NextResponse.json({ entries: await listTimesheetsForReview({ periodLabel: period, status }) });
}

/** Batch approve / request-changes for the given entry ids. `review_timesheet`
 *  only; only entries still `submitted` are acted on. */
export async function POST(req: Request) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { user, canReview } = gate.access;
  if (!canReview) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    ids?: unknown;
    action?: unknown;
    note?: unknown;
  };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is number => Number.isInteger(x)) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty integer array" }, { status: 400 });
  }
  if (body.action !== "approve" && body.action !== "request_changes") {
    return NextResponse.json({ error: "action must be 'approve' or 'request_changes'" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (body.action === "request_changes" && !note) {
    return NextResponse.json({ error: "a note is required when requesting changes" }, { status: 400 });
  }

  const count = await reviewTimesheets(ids, body.action, note, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: body.action === "approve" ? "timesheet.approve" : "timesheet.request_changes",
    entity: "timesheet",
    entityId: null,
    summary: `${body.action === "approve" ? "Approved" : "Requested changes on"} ${count} timesheet ${count === 1 ? "entry" : "entries"}`,
  });
  return NextResponse.json({ ok: true, reviewed: count });
}
