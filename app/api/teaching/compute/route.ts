import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getTeachingConfig } from "@/lib/db/queries";
import { computeTeaching, teachingMonthLabel } from "@/lib/teaching/calc";
import { parseTeachingFile } from "@/lib/teaching/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parse one class_session_attendees export (CSV or .xlsx) and compute per-coach income. */
export async function POST(req: Request) {
  const denied = await requireCapability("run_commission");
  if (denied) return denied;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "missing_file", message: "Upload the class_session_attendees export (CSV or .xlsx)." },
      { status: 400 },
    );
  }

  const rows = await parseTeachingFile(await file.arrayBuffer(), file.name);
  if (rows.length === 0) {
    return NextResponse.json({ error: "empty", message: "No session rows found in the file." }, { status: 400 });
  }

  const config = await getTeachingConfig();
  const summary = computeTeaching(rows, config);
  const monthLabel = teachingMonthLabel(rows);
  return NextResponse.json({ monthLabel, rows, summary, config, count: rows.length });
}
