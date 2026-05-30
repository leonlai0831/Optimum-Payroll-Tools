import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { getAllowanceInputsForPeriod, isPeriodLocked } from "@/lib/db/queries";

/**
 * Saved allowance inputs for one month, keyed by canonical name, plus whether
 * the month is locked. Powers the bulk-by-center entry screen's prefill + merge.
 */
export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const period = new URL(req.url).searchParams.get("period")?.trim();
  if (!period) return NextResponse.json({ error: "period is required" }, { status: 400 });

  const [inputs, locked] = await Promise.all([
    getAllowanceInputsForPeriod(period),
    isPeriodLocked(period),
  ]);
  return NextResponse.json({ locked, inputs: Object.fromEntries(inputs) });
}
