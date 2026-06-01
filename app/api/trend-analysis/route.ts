import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { analyzeTrend, type TrendInput } from "@/lib/ai/anthropic";

/** POST { name, points } -> a natural-language month-over-month trend narrative. */
export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as Partial<TrendInput>;
  const text = await analyzeTrend({ name: body.name ?? "", points: body.points ?? [] });
  return NextResponse.json({ text });
}
