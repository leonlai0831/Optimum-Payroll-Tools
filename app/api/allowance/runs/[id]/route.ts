import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteAllowanceRun, getAllowanceRun, isPeriodLocked } from "@/lib/db/queries";

export async function GET(_req: Request, ctx: RouteContext<"/api/allowance/runs/[id]">) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = await getAllowanceRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
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
