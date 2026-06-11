import {
  createKpiIngestChecked,
  isKpiPeriodClosed,
  recordAudit,
  type KpiIngestSource,
} from "@/lib/db/queries";
import { hasInstructorHeader, mapCsvRows } from "@/lib/kpi/csv";

/** Accepted month format for a staged delivery ("2026-06"). */
export const KPI_PERIOD_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

export type StageKpiDeliveryResult =
  | { ok: true; id: number; rows: number; superseded: number }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Stage a monthly KPI delivery — ONE behavior, two doors: the bearer-keyed
 * machine push (POST /api/ingest/kpi, source "api") and the logged-in manual
 * upload (POST /api/progress/uploads, source "manual") both land here, so the
 * closed-period guard, the atomic supersede of still-pending same-period
 * deliveries, the audit trail and the response shape can never drift apart.
 *
 * - A delivery for a CLOSED period — a finalized KPI run exists for it, or a
 *   delivery for it was already imported — is rejected with 409 before anything
 *   is staged, superseded, or audited (draft runs don't block).
 * - Rows arrive with the same flexible headers as a CSV upload; they're rejected
 *   (400) when no instructor column resolves, then normalized via mapCsvRows.
 * - Staging supersedes any still-pending earlier deliveries for the period in
 *   the same transaction (audited per flip as `kpi_ingest.superseded` inside
 *   createKpiIngest) and audits the new delivery as `kpi_ingest.received`.
 *
 * Callers validate the periodLabel format (KPI_PERIOD_RE) and the raw rows'
 * array shape first — their error messages are transport-specific.
 */
export async function stageKpiDelivery(input: {
  periodLabel: string;
  label: string;
  rawRows: Record<string, unknown>[];
  source: KpiIngestSource;
  /** Audit attribution; null/absent = the machine sender ("ingest-api"). */
  actor?: { id: number | null; email: string } | null;
}): Promise<StageKpiDeliveryResult> {
  const { periodLabel, label, source, actor } = input;

  const closedError = {
    ok: false,
    status: 409,
    error: `${periodLabel} is already finalized — ask the payroll admin to reopen it if a correction is needed.`,
  } as const;

  // Optimistic early check: gives a friendly 409 before the 400 header check and
  // skips the work for an already-closed period. The authoritative guard runs
  // inside createKpiIngestChecked's locked transaction (race-free) below.
  if (await isKpiPeriodClosed(periodLabel)) return closedError;

  if (!hasInstructorHeader(input.rawRows)) {
    return {
      ok: false,
      status: 400,
      error:
        "No instructor column found — rows need a header like Instructor / tr_name / coach (same flexible headers as the CSV upload).",
    };
  }

  // Normalize through the exact same header mapping the CSV upload uses, so a
  // staged delivery behaves identically to a hand-uploaded file from here on.
  const rows = mapCsvRows(input.rawRows);
  const staged = await createKpiIngestChecked({ periodLabel, label, rows, source, actor });
  // The period may have closed between the optimistic check and acquiring the
  // lock (a concurrent finalize/import) — createKpiIngestChecked re-checked under
  // the lock and staged nothing. Surface the same 409.
  if (staged.closed) return closedError;
  const { id, supersededIds } = staged;
  await recordAudit({
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? "ingest-api",
    action: "kpi_ingest.received",
    entity: "kpi_ingest",
    entityId: id,
    summary: `Received ${rows.length} KPI rows for ${periodLabel}${label ? ` (${label})` : ""}${source === "manual" ? " — manual upload" : ""}`,
  });
  return { ok: true, id, rows: rows.length, superseded: supersededIds.length };
}
