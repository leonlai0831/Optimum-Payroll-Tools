import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { saveCenters } from "@/lib/db/queries";

/**
 * Update the shared center list and per-center aliases, preserving the allowance
 * rate tables. When `centerAliases` is omitted the stored aliases are kept.
 */
export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    centers?: unknown;
    centerAliases?: Record<string, unknown>;
  };
  const centerAliases =
    body.centerAliases && typeof body.centerAliases === "object" ? body.centerAliases : undefined;
  await saveCenters(Array.isArray(body.centers) ? body.centers : [], centerAliases);
  return NextResponse.json({ ok: true });
}
