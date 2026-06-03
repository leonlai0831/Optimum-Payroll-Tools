import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getTeachingConfig } from "@/lib/db/queries";
import { computeTeaching } from "@/lib/teaching/calc";
import { buildTeachingWorkbook } from "@/lib/teaching/xlsx";
import type { TeachingConfig, TeachingRow } from "@/lib/teaching/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fileName(monthLabel: string): string {
  const slug = monthLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "month";
  return `optimum_fit_${slug}_coaching_income.xlsx`;
}

/** Build the coaching-income workbook (per-coach summary + class breakdown). */
export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;

  const body = (await req.json()) as { monthLabel?: string; rows: TeachingRow[]; config?: TeachingConfig };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows are required" }, { status: 400 });
  }

  const config = body.config ?? (await getTeachingConfig());
  const monthLabel = body.monthLabel || "Coaching";
  const summary = computeTeaching(body.rows, config);
  const buf = await buildTeachingWorkbook({ monthLabel, summary, config });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName(monthLabel)}"`,
    },
  });
}
