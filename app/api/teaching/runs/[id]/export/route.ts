import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getTeachingRun } from "@/lib/db/queries";
import { buildTeachingWorkbook } from "@/lib/teaching/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fileName(monthLabel: string): string {
  const slug = monthLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "month";
  return `optimum_fit_${slug}_coaching_income.xlsx`;
}

/** Re-export a saved coaching month from its stored summary + config snapshot. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // The workbook contains per-coach earnings — gate on the same commission-module
  // capability as the run's POST/DELETE siblings.
  const denied = await requireCapability("run_commission");
  if (denied) return denied;
  const { id } = await params;
  const run = await getTeachingRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buf = await buildTeachingWorkbook({
    monthLabel: run.periodLabel,
    summary: run.summary,
    config: run.configSnapshot,
  });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName(run.periodLabel)}"`,
    },
  });
}
