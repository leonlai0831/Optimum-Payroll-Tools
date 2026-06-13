import { NextResponse } from "next/server";
import { deleteTimesheetEntry, getTimesheetEntry, updateTimesheetEntry } from "@/lib/db/queries";
import { canEditEntry, timesheetAccess } from "@/lib/timesheet/access";
import { parseTimesheetEntry } from "@/lib/timesheet/validate";

export const dynamic = "force-dynamic";

/** Edit one entry's content (own, or a reviewer on someone's behalf). Any edit
 *  resets it to draft and clears the slotType override. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/timesheets/[id]">) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const entry = await getTimesheetEntry(Number(id));
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!canEditEntry(gate.access, entry.coachId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseTimesheetEntry(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await updateTimesheetEntry(entry.id, {
    coachId: entry.coachId,
    periodLabel: entry.periodLabel,
    ...parsed.value,
  });
  return NextResponse.json({ ok: true, status: "draft" });
}

/** Delete one entry — own draft, or any entry for a reviewer. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/timesheets/[id]">) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const entry = await getTimesheetEntry(Number(id));
  if (!entry) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { access } = gate;
  const ownDraft =
    access.canSubmit && access.user.coachId === entry.coachId && entry.status === "draft";
  if (!ownDraft && !access.canReview) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deleteTimesheetEntry(entry.id);
  return NextResponse.json({ ok: true });
}
