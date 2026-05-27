import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteNote } from "@/lib/db/queries";

export async function DELETE(_req: Request, ctx: RouteContext<"/api/staff/notes/[id]">) {
  const denied = await requireCapability("edit_notes");
  if (denied) return denied;
  const { id } = await ctx.params;
  await deleteNote(Number(id));
  return NextResponse.json({ ok: true });
}
