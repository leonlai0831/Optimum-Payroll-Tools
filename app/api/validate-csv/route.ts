import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { detectCsvAnomalies, type CsvRowForCheck } from "@/lib/ai/anthropic";

/** POST { current, previous? } -> AI-flagged data-quality anomalies for an upload. */
export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    current?: CsvRowForCheck[];
    previous?: CsvRowForCheck[];
  };
  const anomalies = await detectCsvAnomalies(body.current ?? [], body.previous ?? []);
  return NextResponse.json({ anomalies });
}
