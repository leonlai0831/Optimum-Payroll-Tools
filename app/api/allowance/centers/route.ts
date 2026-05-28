import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { saveCenters } from "@/lib/db/queries";

/** Update only the shared center list, preserving the allowance rate tables. */
export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { centers?: unknown };
  await saveCenters(Array.isArray(body.centers) ? body.centers : []);
  return NextResponse.json({ ok: true });
}
