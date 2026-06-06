import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { deleteCoach, getCoach, recordAudit, updateCoach } from "@/lib/db/queries";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";
import { jobRoleForTier } from "@/lib/allowance/tier-rules";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/performance/types";

export async function PATCH(req: Request, ctx: RouteContext<"/api/coaches/[id]">) {
  const denied = await requireCapability("edit_staff");
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    canonicalName?: string;
    center?: string;
    allowanceTier?: string | null;
    active?: boolean;
    employmentType?: string;
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
  if ((EMPLOYMENT_TYPES as readonly string[]).includes(body.employmentType ?? "")) {
    patch.employmentType = body.employmentType as EmploymentType;
  }

  const before = await getCoach(Number(id));
  // Rule: the job role is derived from the pay tier (A1/A2/A3 → front desk, else
  // instructor) and is never set by hand. Re-derive it whenever the tier changes.
  if (patch.allowanceTier !== undefined) {
    const derived = jobRoleForTier(patch.allowanceTier);
    if (!before || derived !== before.jobRole) patch.jobRole = derived;
  }
  await updateCoach(Number(id), patch);
  const actor = await getCurrentUser();
  if (actor) {
    const changed = [
      patch.canonicalName !== undefined &&
        (!before || patch.canonicalName !== before.canonicalName) &&
        `name→"${patch.canonicalName}"`,
      patch.center !== undefined && `center→"${patch.center}"`,
      patch.allowanceTier !== undefined && `tier→${patch.allowanceTier ?? "none"}`,
      patch.active !== undefined && (patch.active ? "activated" : "deactivated"),
      patch.jobRole !== undefined && `role→${patch.jobRole}`,
      patch.employmentType !== undefined && `type→${patch.employmentType}`,
    ].filter(Boolean);
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "coach.update",
      entity: "coach",
      entityId: id,
      summary: `Updated employee ${before ? `"${before.canonicalName}"` : `#${id}`}${
        changed.length ? `: ${changed.join(", ")}` : ""
      }`,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/coaches/[id]">) {
  const denied = await requireCapability("edit_staff");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await ctx.params;
  const before = await getCoach(Number(id));
  await deleteCoach(Number(id));
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "coach.delete",
      entity: "coach",
      entityId: id,
      summary: `Deleted employee ${before ? `"${before.canonicalName}"` : `#${id}`}`,
    });
  }
  return NextResponse.json({ ok: true });
}
