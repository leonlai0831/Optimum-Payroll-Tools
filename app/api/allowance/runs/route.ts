import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  checkAllowancePeriodAllowed,
  createAllowanceRun,
  getAllowanceConfig,
  isPeriodLocked,
  listAllowanceRuns,
  recordAudit,
} from "@/lib/db/queries";
import { calcAllowance } from "@/lib/allowance/calc";
import { isValidPeriod } from "@/lib/allowance/period";
import type { AllowanceInput } from "@/lib/allowance/types";

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const period = new URL(req.url).searchParams.get("period") ?? undefined;
  return NextResponse.json(await listAllowanceRuns(period));
}

export async function POST(req: Request) {
  const denied = await requireCapability("run_allowance");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json()) as { periodLabel: string; input: AllowanceInput };
  if (!body.periodLabel || !isValidPeriod(body.periodLabel)) {
    return NextResponse.json({ error: "periodLabel must be a valid YYYY-MM month" }, { status: 400 });
  }
  if (!body.input?.name?.trim()) {
    return NextResponse.json({ error: "coach name is required" }, { status: 400 });
  }
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
  // and snapshot that config so the saved record stays reproducible.
  const configSnapshot = await getAllowanceConfig();
  const result = calcAllowance(body.input, configSnapshot);
  const id = await createAllowanceRun({
    periodLabel: body.periodLabel,
    input: body.input,
    result,
    configSnapshot,
  });
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
