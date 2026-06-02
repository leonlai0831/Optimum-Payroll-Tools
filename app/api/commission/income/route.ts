import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getCommissionRun, getTeachingConfig } from "@/lib/db/queries";
import { computeTeaching } from "@/lib/teaching/calc";
import { parseTeachingFile } from "@/lib/teaching/parse";
import { mergeIncome } from "@/lib/earnings/income";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-staff income = a saved commission month (by staff_code) merged with an
 * uploaded coaching file (by coach name). People are matched on a normalised name.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;

  const form = await req.formData();
  const runId = Number(form.get("runId"));
  const file = form.get("file");
  if (!runId) return NextResponse.json({ error: "runId is required" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "missing_file", message: "Upload the coaching (class attendees) file." },
      { status: 400 },
    );
  }

  const run = await getCommissionRun(runId);
  if (!run) return NextResponse.json({ error: "commission run not found" }, { status: 404 });

  const teachingConfig = await getTeachingConfig();
  const teachingRows = await parseTeachingFile(await file.arrayBuffer(), file.name);
  const coaching = computeTeaching(teachingRows, teachingConfig).coaches;
  const report = mergeIncome(run.summary.staff, coaching);

  return NextResponse.json({ monthLabel: run.periodLabel, report });
}
