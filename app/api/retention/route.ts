import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getTrendData } from "@/lib/db/queries";
import { retentionWatch } from "@/lib/kpi/retention";
import { narrateRetention } from "@/lib/ai/anthropic";

/**
 * GET supportive retention check-in signals. The watch list is computed
 * deterministically and transparently from KPI score history
 * (lib/kpi/retention.ts) — it is NOT an attrition prediction. Gated on
 * swim_view_staff: this is sensitive people data, so only management-level roles
 * who can already see all staff get it.
 */
export async function GET() {
  const denied = await requireCapability("swim_view_staff");
  if (denied) return denied;

  const trend = await getTrendData();
  const watch = retentionWatch(
    trend.coaches.map((c) => ({
      name: c.name,
      points: c.points.map((p) => ({ period: p.period, score: p.score })),
    })),
  );
  const summary = await narrateRetention(
    watch.map((w) => ({ name: w.name, level: w.level, reasons: w.reasons })),
  );

  return NextResponse.json({ watch, summary });
}
