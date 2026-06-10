import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getAllowanceConfig, saveAllowanceRates } from "@/lib/db/queries";
import type { AllowanceConfig } from "@/lib/allowance/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await getAllowanceConfig());
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Clamp every numeric leaf of a tier→amounts record into [0, 100000] (RM). */
function sanitizeRateTable(table: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!isObject(table)) return out;
  for (const [tier, amounts] of Object.entries(table)) {
    if (!isObject(amounts)) continue;
    const row: Record<string, number> = {};
    for (const [k, v] of Object.entries(amounts)) {
      const n = Number(v);
      row[k] = Number.isFinite(n) ? Math.min(100000, Math.max(0, n)) : 0;
    }
    out[tier] = row;
  }
  return out;
}

export async function PUT(req: Request) {
  const denied = await requireCapability("swim_edit_settings");
  if (denied) return denied;
  const data = (await req.json().catch(() => null)) as AllowanceConfig | null;

  // Hardening (route already requires swim_edit_settings): reject malformed bodies and
  // clamp the rate-table amounts to sane non-negative ringgit before persisting.
  // `saveAllowanceRates` already preserves centers/aliases (managed under Staff).
  if (!isObject(data)) {
    return NextResponse.json({ error: "invalid config body" }, { status: 400 });
  }
  const sanitized = {
    ...data,
    attendance: sanitizeRateTable(data.attendance),
    teaching: sanitizeRateTable(data.teaching),
  } as unknown as AllowanceConfig;

  await saveAllowanceRates(sanitized);
  return NextResponse.json({ ok: true });
}
