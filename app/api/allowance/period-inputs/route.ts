import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getAllowanceInputsForPeriod, isPeriodLocked } from "@/lib/db/queries";

/**
 * Saved allowance inputs for one month, keyed by canonical name, plus whether
 * the month is locked. Powers the bulk-by-center entry screen's prefill + merge.
 */
export async function GET(req: Request) {
  // Prefilled allowance inputs are staff pay data — gate on the allowance module's
  // capability (matches the bulk-entry page, which redirects without run_allowance).
  const denied = await requireCapability("run_allowance");
  if (denied) return denied;
  const period = new URL(req.url).searchParams.get("period")?.trim();
  if (!period) return NextResponse.json({ error: "period is required" }, { status: 400 });

  const [inputs, locked] = await Promise.all([
    getAllowanceInputsForPeriod(period),
    isPeriodLocked(period),
  ]);
  return NextResponse.json({ locked, inputs: Object.fromEntries(inputs) });
}
