import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { summarizeRun, type DigestInput } from "@/lib/ai/anthropic";

/** POST { period, coaches } -> a natural-language monthly digest of a run. */
export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Partial<DigestInput>;
  const text = await summarizeRun({ period: body.period ?? "", coaches: body.coaches ?? [] });
  return NextResponse.json({ text });
}
