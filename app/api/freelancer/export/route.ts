import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getFreelancerRunsForPeriod } from "@/lib/db/queries";
import { buildFreelancerBankWorkbook, freelancerFileName } from "@/lib/freelancer/xlsx";
import { isValidPeriod } from "@/lib/allowance/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Build the per-entity bank-transfer .xlsx for one saved month and stream it back. */
export async function GET(req: Request) {
  const denied = await requireCapability("run_freelancer");
  if (denied) return denied;

  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!isValidPeriod(period)) {
    return NextResponse.json({ error: "period must be a valid YYYY-MM month" }, { status: 400 });
  }

  const runs = await getFreelancerRunsForPeriod(period);
  const buf = await buildFreelancerBankWorkbook({ period, runs });

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${freelancerFileName(period)}"`,
    },
  });
}
