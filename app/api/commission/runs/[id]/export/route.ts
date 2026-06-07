import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getCommissionRun } from "@/lib/db/queries";
import { buildReportWorkbook } from "@/lib/commission/xlsx";
import { commissionFileName } from "@/lib/commission/filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Re-export a saved month's workbook from its stored rows + config snapshot. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // The workbook contains per-staff earnings — gate on the same commission-module
  // capability as the run's POST/DELETE siblings.
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  const { id } = await params;
  const run = await getCommissionRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buf = await buildReportWorkbook({
    monthLabel: run.periodLabel,
    rows: run.salesRows,
    summary: run.summary,
    config: run.configSnapshot,
  });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${commissionFileName(run.periodLabel)}"`,
    },
  });
}
