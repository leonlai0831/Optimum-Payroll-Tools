import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { analyzePerformance, type AnalyzeInput } from "@/lib/ai/anthropic";

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as AnalyzeInput;
  const text = await analyzePerformance(body);
  return NextResponse.json({ text });
}
