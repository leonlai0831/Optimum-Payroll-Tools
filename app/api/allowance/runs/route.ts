import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createAllowanceRun, getAllowanceConfig, listAllowanceRuns } from "@/lib/db/queries";
import { calcAllowance } from "@/lib/allowance/calc";
import type { AllowanceInput } from "@/lib/allowance/types";

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const period = new URL(req.url).searchParams.get("period") ?? undefined;
  return NextResponse.json(await listAllowanceRuns(period));
}

export async function POST(req: Request) {
  const denied = await requireCapability("run_allowance");
  if (denied) return denied;
  const body = (await req.json()) as { periodLabel: string; input: AllowanceInput };
  if (!body.periodLabel) {
    return NextResponse.json({ error: "periodLabel is required" }, { status: 400 });
  }
  if (!body.input?.name?.trim()) {
    return NextResponse.json({ error: "coach name is required" }, { status: 400 });
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
  return NextResponse.json({ ok: true, id });
}
