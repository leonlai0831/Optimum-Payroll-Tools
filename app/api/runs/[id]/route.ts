import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { deleteRun, getRun } from "@/lib/db/queries";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const run = await getRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await deleteRun(Number(id));
  return NextResponse.json({ ok: true });
}
