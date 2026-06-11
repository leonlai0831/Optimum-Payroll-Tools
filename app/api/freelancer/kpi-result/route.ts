import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getKpiResultCandidates } from "@/lib/db/queries";
import { isValidPeriod } from "@/lib/allowance/period";

export const dynamic = "force-dynamic";

/**
 * KPI → freelancer "student result" lookup for one period.
 *   ?period=YYYY-MM&q=cha    → search: matching instructor accounts + totals
 *   ?period=YYYY-MM&name=X   → exact: the bound account's totals (or null)
 *
 * A period's KPI data is pushed on the 1st of the FOLLOWING month, so an
 * empty result usually means "not delivered yet" — the calculator falls back
 * to manual entry.
 */
export async function GET(req: Request) {
  const denied = await requireCapability("run_freelancer");
  if (denied) return denied;

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "";
  if (!isValidPeriod(period)) {
    return NextResponse.json({ error: "Invalid period." }, { status: 400 });
  }
  const candidates = await getKpiResultCandidates(period);
  const hasData = candidates.length > 0;

  const name = url.searchParams.get("name")?.trim();
  if (name) {
    const key = name.toUpperCase();
    const match = candidates.find((c) => c.name.toUpperCase() === key) ?? null;
    return NextResponse.json({ hasData, match });
  }

  const q = (url.searchParams.get("q") ?? "").trim().toUpperCase();
  if (!q) return NextResponse.json({ hasData, candidates: [] });
  return NextResponse.json({
    hasData,
    candidates: candidates.filter((c) => c.name.toUpperCase().includes(q)).slice(0, 12),
  });
}
