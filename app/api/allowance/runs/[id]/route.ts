import { NextResponse } from "next/server";
import { requireCapability, requireManager } from "@/lib/auth/permissions";
import {
  deleteAllowanceRun,
  getAllowanceRun,
  isPeriodLocked,
  moveAllowanceRun,
  recordAudit,
} from "@/lib/db/queries";
import { isValidPeriod } from "@/lib/allowance/period";

export async function GET(_req: Request, ctx: RouteContext<"/api/allowance/runs/[id]">) {
  // A single allowance run is a staff pay record — same gate as the list + siblings.
  const denied = await requireCapability("run_allowance");
  if (denied) return denied;
  const { id } = await ctx.params;
  const run = await getAllowanceRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

/**
 * Move a single entry to a different month (per-row "Change month"). Manager-only.
 * Both the source and target months must be unlocked, and the staff member must
 * not already have an entry in the target month (we never overwrite — 409 instead).
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/allowance/runs/[id]">) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;
  const { id } = await ctx.params;
  const run = await getAllowanceRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { periodLabel?: string };
  const to = body.periodLabel?.trim();
  if (!to || !isValidPeriod(to)) {
    return NextResponse.json({ error: "periodLabel must be a valid YYYY-MM month" }, { status: 400 });
  }
  if (to === run.periodLabel) return NextResponse.json({ ok: true, moved: false });

  if (await isPeriodLocked(run.periodLabel)) {
    return NextResponse.json(
      { error: `${run.periodLabel} is locked. Unlock the month to move entries out of it.` },
      { status: 409 },
    );
  }
  if (await isPeriodLocked(to)) {
    return NextResponse.json(
      { error: `${to} is locked. Unlock the month before moving entries into it.` },
      { status: 409 },
    );
  }

  const res = await moveAllowanceRun(Number(id), to);
  if (!res.ok) {
    return NextResponse.json(
      { error: `${res.name} already has an entry in ${to}. Resolve that one first.` },
      { status: 409 },
    );
  }
  await recordAudit({
    actorId: gate.user.id,
    actorEmail: gate.user.email,
    action: "allowance.period_change",
    entity: "allowance_run",
    entityId: Number(id),
    summary: `Moved ${res.name} allowance ${res.from} → ${to}`,
  });
  return NextResponse.json({ ok: true, moved: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/allowance/runs/[id]">) {
  const denied = await requireCapability("run_allowance");
  if (denied) return denied;
  const { id } = await ctx.params;
  const run = await getAllowanceRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (await isPeriodLocked(run.periodLabel)) {
    return NextResponse.json(
      { error: `${run.periodLabel} is locked. Unlock the month to make changes.` },
      { status: 409 },
    );
  }
  await deleteAllowanceRun(Number(id));
  return NextResponse.json({ ok: true });
}
