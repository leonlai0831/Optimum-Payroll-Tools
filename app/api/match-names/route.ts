import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { matchInstructorNames, type AccountForMatch } from "@/lib/ai/anthropic";

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { accounts?: AccountForMatch[] };
  const clusters = await matchInstructorNames(body.accounts ?? []);
  return NextResponse.json({ clusters });
}
