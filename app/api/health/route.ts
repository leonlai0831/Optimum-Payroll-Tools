import { NextResponse } from "next/server";
import { getHealthReport } from "@/lib/health";

// Always reflect live env + DB state, never a build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Public deployment self-check (no auth — it must be reachable before login so a
 * broken deploy can be diagnosed). Returns only booleans + hints, no secrets.
 */
export async function GET() {
  const report = await getHealthReport();
  return NextResponse.json(report);
}
