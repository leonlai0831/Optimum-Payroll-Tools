import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getAllowanceConfig, saveAllowanceConfig } from "@/lib/db/queries";

/** Update only the shared center list, preserving the allowance rate tables. */
export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { centers?: unknown };
  const centers = Array.isArray(body.centers)
    ? [...new Set(body.centers.map((c) => String(c).trim()).filter(Boolean))]
    : [];
  const current = await getAllowanceConfig();
  await saveAllowanceConfig({ ...current, centers });
  return NextResponse.json({ ok: true });
}
