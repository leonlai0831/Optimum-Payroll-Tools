import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getAllowanceConfig, saveAllowanceRates } from "@/lib/db/queries";
import type { AllowanceConfig } from "@/lib/allowance/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getAllowanceConfig());
}

export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  await saveAllowanceRates((await req.json()) as AllowanceConfig);
  return NextResponse.json({ ok: true });
}
