import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { recordAudit, saveCenters } from "@/lib/db/queries";

/**
 * Update the shared center list and per-center aliases, preserving the allowance
 * rate tables. When `centerAliases` is omitted the stored aliases are kept.
 */
export async function PUT(req: Request) {
  const denied = await requireCapability("swim_edit_settings");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const body = (await req.json().catch(() => ({}))) as {
    centers?: unknown;
    centerAliases?: Record<string, unknown>;
  };
  const centerAliases =
    body.centerAliases && typeof body.centerAliases === "object" ? body.centerAliases : undefined;
  const centers = Array.isArray(body.centers) ? body.centers : [];
  await saveCenters(centers, centerAliases);
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "centers.update",
      entity: "allowance_config",
      summary: `Updated center list (${centers.length} centers)`,
    });
  }
  return NextResponse.json({ ok: true });
}
