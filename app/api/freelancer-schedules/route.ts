import { NextResponse } from "next/server";
import { listFreelancerSchedule, recordAudit, replaceFreelancerSchedule } from "@/lib/db/queries";
import { timesheetAccess } from "@/lib/timesheet/access";
import { parseScheduleSlots } from "@/lib/timesheet/validate";

export const dynamic = "force-dynamic";

function parseCoachId(url: URL): number | null {
  const v = url.searchParams.get("coachId");
  if (v == null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

/** List one freelancer's fixed schedule. */
export async function GET(req: Request) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { canManageSchedule, canReview } = gate.access;
  if (!canManageSchedule && !canReview) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const coachId = parseCoachId(new URL(req.url));
  if (coachId == null) return NextResponse.json({ error: "coachId is required" }, { status: 400 });
  return NextResponse.json({ slots: await listFreelancerSchedule(coachId) });
}

/** Replace one freelancer's whole fixed schedule. */
export async function PUT(req: Request) {
  const gate = await timesheetAccess();
  if ("error" in gate) return gate.error;
  const { user, canManageSchedule } = gate.access;
  if (!canManageSchedule) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const coachId = parseCoachId(new URL(req.url));
  if (coachId == null) return NextResponse.json({ error: "coachId is required" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseScheduleSlots(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  await replaceFreelancerSchedule(coachId, parsed.value);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "freelancer_schedule.replace",
    entity: "coach",
    entityId: coachId,
    summary: `Set freelancer fixed schedule (${parsed.value.length} slot${parsed.value.length === 1 ? "" : "s"}) for coach #${coachId}`,
  });
  return NextResponse.json({ ok: true, count: parsed.value.length });
}
