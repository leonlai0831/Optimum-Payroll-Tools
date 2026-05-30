import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthed } from "@/lib/auth/session";
import { lockPeriod, listAllowanceLocks, recordAudit, unlockPeriod } from "@/lib/db/queries";

/** Closing/reopening a payroll month is reserved for admins + super admins. */
async function requireCloser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "admin" && user.role !== "super_admin") {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listAllowanceLocks());
}

export async function POST(req: Request) {
  const gate = await requireCloser();
  if ("error" in gate) return gate.error;

  const body = (await req.json().catch(() => ({}))) as { period?: string; locked?: boolean };
  const period = body.period?.trim();
  if (!period) return NextResponse.json({ error: "period is required" }, { status: 400 });

  if (body.locked) {
    await lockPeriod(period, gate.user.email);
  } else {
    await unlockPeriod(period);
  }
  await recordAudit({
    actorId: gate.user.id,
    actorEmail: gate.user.email,
    action: body.locked ? "allowance.lock" : "allowance.unlock",
    entity: "allowance_period",
    entityId: period,
    summary: `${body.locked ? "Locked" : "Unlocked"} allowance month ${period}`,
  });
  return NextResponse.json({ ok: true });
}
