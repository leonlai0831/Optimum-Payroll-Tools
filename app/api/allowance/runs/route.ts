import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  checkAllowancePeriodAllowed,
  createAllowanceRunIfUnlocked,
  getAllowanceConfigFresh,
  isPeriodLocked,
  listAllowanceRuns,
  recordAudit,
} from "@/lib/db/queries";
import { calcAllowance } from "@/lib/allowance/calc";
import { isValidPeriod } from "@/lib/allowance/period";
import type { AllowanceInput } from "@/lib/allowance/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Saved allowance runs are staff pay records — gate on the allowance module's
  // capability (matches the POST/DELETE siblings and the allowance pages).
  const denied = await requireCapability("run_allowance");
  if (denied) return denied;
  const period = new URL(req.url).searchParams.get("period") ?? undefined;
  return NextResponse.json(await listAllowanceRuns(period));
}

export async function POST(req: Request) {
  const denied = await requireCapability("run_allowance");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as { periodLabel?: string; input?: AllowanceInput };
  if (!body.periodLabel || !isValidPeriod(body.periodLabel)) {
    return NextResponse.json({ error: "periodLabel must be a valid YYYY-MM month" }, { status: 400 });
  }
  if (!body.input?.name?.trim()) {
    return NextResponse.json({ error: "coach name is required" }, { status: 400 });
  }
  // Fast-path pre-check for the common case (avoids the sequential-month guard +
  // config read + recompute when the month is already locked). NOT authoritative:
  // the lock is re-checked atomically with the write below, so a concurrent
  // lockPeriod between here and the save can't slip a record into a locked month.
  if (await isPeriodLocked(body.periodLabel)) {
    return NextResponse.json(
      { error: `${body.periodLabel} is locked. Unlock the month to make changes.` },
      { status: 409 },
    );
  }
  // Sequential-month guard ("防呆"): can't open a new month until the previous one
  // has entries — stops a May batch being keyed under June by mistake.
  const seq = await checkAllowancePeriodAllowed(body.periodLabel);
  if (!seq.allowed) {
    return NextResponse.json(
      {
        error: `Can't start ${body.periodLabel} yet — ${seq.previousPeriod} has no entries. Key ${seq.previousPeriod} first (months are entered in order). If this month was keyed under the wrong label, use "Change month" on the History page instead.`,
      },
      { status: 422 },
    );
  }
  // Recompute server-side from the live config (ignore any client-sent result),
  // and snapshot that config so the saved record stays reproducible. Read FRESH
  // (cache-bypassing) so a multi-instance deploy never snapshots stale rates.
  const configSnapshot = await getAllowanceConfigFresh();
  const result = calcAllowance(body.input, configSnapshot);
  // Atomic: re-checks the period lock FOR UPDATE in the same transaction as the
  // write, closing the TOCTOU window against a concurrent lockPeriod.
  const saved = await createAllowanceRunIfUnlocked({
    periodLabel: body.periodLabel,
    input: body.input,
    result,
    configSnapshot,
  });
  if (saved.locked) {
    return NextResponse.json(
      { error: `${body.periodLabel} is locked. Unlock the month to make changes.` },
      { status: 409 },
    );
  }
  const id = saved.id;
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "allowance.save",
      entity: "allowance_run",
      entityId: id,
      summary: `Saved allowance for ${body.input.name.trim()} (${body.periodLabel})`,
    });
  }
  return NextResponse.json({ ok: true, id });
}
