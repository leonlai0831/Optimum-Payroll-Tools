import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { buildIncomeWorkbook } from "@/lib/earnings/xlsx";
import type { IncomeReport } from "@/lib/earnings/income";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fileName(monthLabel: string): string {
  const slug = monthLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "month";
  return `optimum_fit_${slug}_staff_earnings.xlsx`;
}

export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;

  const body = (await req.json()) as { monthLabel?: string; report: IncomeReport };
  if (!body.report || !Array.isArray(body.report.rows)) {
    return NextResponse.json({ error: "report is required" }, { status: 400 });
  }
  const monthLabel = body.monthLabel || "Earnings";
  const buf = await buildIncomeWorkbook({ monthLabel, report: body.report });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName(monthLabel)}"`,
    },
  });
}
