import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { KPI_PERIOD_RE, stageKpiDelivery } from "@/lib/ingest/stage";

export const dynamic = "force-dynamic";

/**
 * Manual upload door of the Student Progress module: a logged-in owner stages
 * the monthly student data from /progress/upload (CSV parsed client-side with
 * the same flexible headers as the KPI dashboard upload). Body:
 * `{ periodLabel: "YYYY-MM", label?, rows }`. The staging behavior — closed-
 * period 409 guard, atomic supersede of still-pending same-period deliveries,
 * audit trail, response shape — is lib/ingest/stage.ts, shared verbatim with
 * the machine push (POST /api/ingest/kpi); only the door differs (session +
 * `run_kpi` capability here, bearer key there) and the source is "manual".
 */
export async function POST(req: Request) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const actor = await getCurrentUser();

  const body = (await req.json().catch(() => ({}))) as {
    periodLabel?: unknown;
    label?: unknown;
    rows?: unknown;
  };

  const periodLabel = typeof body.periodLabel === "string" ? body.periodLabel.trim() : "";
  if (!KPI_PERIOD_RE.test(periodLabel)) {
    return NextResponse.json(
      { ok: false, error: 'periodLabel is required in "YYYY-MM" format.' },
      { status: 400 },
    );
  }
  if (
    !Array.isArray(body.rows) ||
    body.rows.length === 0 ||
    !body.rows.every((r) => r != null && typeof r === "object" && !Array.isArray(r))
  ) {
    return NextResponse.json(
      { ok: false, error: "rows must be a non-empty array of objects." },
      { status: 400 },
    );
  }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : "";

  const staged = await stageKpiDelivery({
    periodLabel,
    label,
    rawRows: body.rows as Record<string, unknown>[],
    source: "manual",
    actor: actor ? { id: actor.id, email: actor.email } : null,
  });
  if (!staged.ok) {
    return NextResponse.json({ ok: false, error: staged.error }, { status: staged.status });
  }
  return NextResponse.json(staged);
}
