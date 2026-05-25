import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { getAllowanceConfig, saveAllowanceConfig } from "@/lib/db/queries";
import type { AllowanceConfig } from "@/lib/allowance/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getAllowanceConfig());
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = (await req.json()) as AllowanceConfig;
  await saveAllowanceConfig(data);
  return NextResponse.json({ ok: true });
}
