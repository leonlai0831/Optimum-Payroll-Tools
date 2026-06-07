import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { analyzePerformance, type AnalyzeInput } from "@/lib/ai/anthropic";

export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as AnalyzeInput;
  const text = await analyzePerformance(body);
  return NextResponse.json({ text });
}
