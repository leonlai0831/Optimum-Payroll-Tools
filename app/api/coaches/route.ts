import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { listCoaches } from "@/lib/db/queries";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listCoaches());
}
