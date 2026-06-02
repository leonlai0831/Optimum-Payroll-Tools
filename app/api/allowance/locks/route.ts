import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { requireManager } from "@/lib/auth/permissions";
import { lockPeriod, listAllowanceLocks, recordAudit, unlockPeriod } from "@/lib/db/queries";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listAllowanceLocks());
}

export async function POST(req: Request) {
  const gate = await requireManager();
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
