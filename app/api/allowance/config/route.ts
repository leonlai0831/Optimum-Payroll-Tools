import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getAllowanceConfig, saveAllowanceConfig } from "@/lib/db/queries";
import type { AllowanceConfig } from "@/lib/allowance/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getAllowanceConfig());
}

export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;
  const data = (await req.json()) as AllowanceConfig;
  // Centers are managed in the Staff module (Staff -> Settings); a rates save here
  // must never change them, so always keep the stored list.
  data.centers = (await getAllowanceConfig()).centers;
  await saveAllowanceConfig(data);
  return NextResponse.json({ ok: true });
}
