import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getCommissionConfig } from "@/lib/db/queries";
import { computeCommission } from "@/lib/commission/calc";
import { buildReportWorkbook } from "@/lib/commission/xlsx";
import type { CommissionConfig, CommissionRow } from "@/lib/commission/types";
import { commissionFileName } from "@/lib/commission/filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Build the 2-tab .xlsx for a just-computed (unsaved) month and stream it back. */
export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;

  const body = (await req.json()) as {
    monthLabel?: string;
    rows: CommissionRow[];
    config?: CommissionConfig;
  };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }

  const config = body.config ?? (await getCommissionConfig());
  const monthLabel = body.monthLabel || "Sales";
  const summary = computeCommission(body.rows, config);
  const buf = await buildReportWorkbook({ monthLabel, rows: body.rows, summary, config });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${commissionFileName(monthLabel)}"`,
    },
  });
}
