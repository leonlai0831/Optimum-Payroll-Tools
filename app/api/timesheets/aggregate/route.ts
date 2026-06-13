import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { getApprovedFreelancerRows, getApprovedTeachingRows } from "@/lib/db/queries";
import { parsePeriod } from "@/lib/timesheet/validate";

export const dynamic = "force-dynamic";

/**
 * Approved clock-in hours for one coach + month, aggregated for a calculator to
 * load. `mode=allowance` → `{ teachingRows }` (lesson hours folded into the 3
 * rate buckets); `mode=freelancer` → `{ centerRows, absences }` (reconciled
 * against the freelancer's fixed schedule). Gated on the matching calculator
 * capability.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  if (mode !== "allowance" && mode !== "freelancer") {
    return NextResponse.json({ error: "mode must be 'allowance' or 'freelancer'" }, { status: 400 });
  }
  if (!(await userCan(user, mode === "allowance" ? "run_allowance" : "run_freelancer"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const coachId = Number(url.searchParams.get("coachId"));
  if (!Number.isInteger(coachId)) {
    return NextResponse.json({ error: "coachId must be an integer" }, { status: 400 });
  }
  const period = parsePeriod(url.searchParams.get("period"));
  if (!period) return NextResponse.json({ error: "period must be YYYY-MM" }, { status: 400 });

  if (mode === "allowance") {
    return NextResponse.json({ teachingRows: await getApprovedTeachingRows(coachId, period) });
  }
  return NextResponse.json(await getApprovedFreelancerRows(coachId, period));
}
