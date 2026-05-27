import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteCoach, updateCoach } from "@/lib/db/queries";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";

export async function PATCH(req: Request, ctx: RouteContext<"/api/coaches/[id]">) {
  const denied = await requireCapability("edit_staff");
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    canonicalName?: string;
    center?: string;
    allowanceTier?: string | null;
    active?: boolean;
  };

  const patch: Parameters<typeof updateCoach>[1] = {};
  if (typeof body.canonicalName === "string" && body.canonicalName.trim()) {
    patch.canonicalName = body.canonicalName.trim();
  }
  if (typeof body.center === "string") patch.center = body.center.trim();
  if (body.allowanceTier === null) {
    patch.allowanceTier = null;
  } else if (
    typeof body.allowanceTier === "string" &&
    (ALLOWANCE_TIERS as readonly string[]).includes(body.allowanceTier)
  ) {
    patch.allowanceTier = body.allowanceTier as AllowanceTier;
  }
  if (typeof body.active === "boolean") patch.active = body.active;

  await updateCoach(Number(id), patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/coaches/[id]">) {
  const denied = await requireCapability("edit_staff");
  if (denied) return denied;
  const { id } = await ctx.params;
  await deleteCoach(Number(id));
  return NextResponse.json({ ok: true });
}
