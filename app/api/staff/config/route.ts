import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getPerformanceConfig, savePerformanceConfig } from "@/lib/db/queries";
import type { AppraisalDimension } from "@/lib/performance/types";

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "dimension"
  );
}

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getPerformanceConfig());
}

export async function PUT(req: Request) {
  const denied = await requireCapability("edit_settings");
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { dimensions?: unknown };
  const raw = Array.isArray(body.dimensions) ? body.dimensions : [];
  const dimensions: AppraisalDimension[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const d = item as { key?: unknown; label?: unknown };
    const label = typeof d.label === "string" ? d.label.trim() : "";
    if (!label) continue;
    let key = typeof d.key === "string" && d.key.trim() ? d.key.trim() : slugify(label);
    while (seen.has(key)) key = `${key}_2`;
    seen.add(key);
    dimensions.push({ key, label });
  }
  await savePerformanceConfig({ dimensions });
  return NextResponse.json({ ok: true });
}
