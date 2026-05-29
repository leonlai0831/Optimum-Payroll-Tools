import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { getConfig, saveConfig } from "@/lib/db/queries";
import type { AppConfig } from "@/lib/kpi/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getConfig());
}

export async function PUT(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const data = (await req.json()) as AppConfig;
  await saveConfig(data);
  return NextResponse.json({ ok: true });
}
