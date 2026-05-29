import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { matchInstructorNames, type AccountForMatch } from "@/lib/ai/anthropic";

export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { accounts?: AccountForMatch[] };
  const clusters = await matchInstructorNames(body.accounts ?? []);
  return NextResponse.json({ clusters });
}
