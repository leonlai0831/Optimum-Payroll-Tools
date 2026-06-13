import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  createRun,
  getConfig,
  getKpiIngest,
  getLatestAssessmentFinalByCoach,
  importKpiIngest,
  isKpiPeriodClosed,
  listAllowanceRuns,
  listCoaches,
  listRuns,
  recordAudit,
} from "@/lib/db/queries";
import { matchInstructorNames } from "@/lib/ai/anthropic";
import {
  accountsForMatch,
  buildRunCoaches,
  type BuildRunAllowanceRec,
  type BuildRunCoachProfile,
} from "@/lib/kpi/build-run";

export const dynamic = "force-dynamic";

/**
 * Auto-compute a DRAFT KPI run from a staged Student Progress delivery — the
 * server-side equivalent of "Load into calculator → merge → save", without the
 * manual calculator step. The merge (deterministic + known aliases + a
 * best-effort AI pass) and v11.1 scoring run on the server via `buildRunCoaches`;
 * carry-over (allowance, last management assessment, latest assessment %) prefills
 * what isn't in the CSV.
 *
 * The result is ALWAYS a draft (`status: "draft"`): the name merge is
 * payroll-critical and several inputs (management assessment, supervisor group
 * hours) aren't in the upload, so a manager reviews + finalizes on the existing
 * KPI history review screen (`finalize_kpi`). Persists exactly like the dashboard
 * save — `createRun` + `importKpiIngest` (which closes the period under the same
 * advisory lock), so the closed-month guarantees are unchanged.
 */
export async function POST(_req: Request, ctx: RouteContext<"/api/kpi/ingests/[id]/compute">) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const actor = await getCurrentUser();

  const { id } = await ctx.params;
  const ingestId = Number(id);
  if (!Number.isInteger(ingestId)) {
    return NextResponse.json({ error: "Invalid delivery id." }, { status: 400 });
  }

  const ingest = await getKpiIngest(ingestId);
  if (!ingest) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
  if (ingest.status !== "pending") {
    return NextResponse.json(
      { error: "Only a pending delivery can be computed into a draft." },
      { status: 409 },
    );
  }

  const rows = Array.isArray(ingest.rows) ? ingest.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "This delivery has no rows to score." }, { status: 400 });
  }

  // A finalized run or an already-imported delivery has closed this month.
  if (await isKpiPeriodClosed(ingest.periodLabel)) {
    return NextResponse.json(
      { error: "This month is already finalized — reopen its run to recompute." },
      { status: 409 },
    );
  }
  // A draft already exists for the month: send the reviewer there instead of
  // creating a duplicate (the editor uses `runId` to redirect).
  const existingDraft = (await listRuns()).find(
    (r) => r.periodLabel === ingest.periodLabel && r.status === "draft",
  );
  if (existingDraft) {
    return NextResponse.json(
      {
        error: "A draft KPI run already exists for this month — review it.",
        runId: existingDraft.id,
      },
      { status: 409 },
    );
  }

  const [config, coachRecords, assessmentMap, allowanceRuns] = await Promise.all([
    getConfig(),
    listCoaches(),
    getLatestAssessmentFinalByCoach(),
    // The WORK month's saved Allowance run — the authoritative teaching
    // allowance (always keyed before KPI runs). Linked per coach in build-run.
    listAllowanceRuns(ingest.periodLabel),
  ]);

  // Best-effort AI same-person clustering — degrades to [] without an API key,
  // and any failure leaves the deterministic + alias merge intact.
  let aiClusters: string[][] = [];
  try {
    aiClusters = await matchInstructorNames(accountsForMatch(rows));
  } catch {
    /* deterministic merge still applies */
  }

  const coaches: BuildRunCoachProfile[] = coachRecords.map((c) => ({
    id: c.id,
    canonicalName: c.canonicalName,
    aliases: c.aliases ?? [],
    defaultPosition: c.defaultPosition,
    lastAllowance: c.lastAllowance,
    lastMgmtAssessment: c.lastMgmtAssessment,
  }));
  const assessmentByCoachId: Record<number, number> = Object.fromEntries(
    [...assessmentMap.entries()].map(([coachId, pct]) => [coachId, Math.round(pct)]),
  );
  // Enrich each allowance record with its coach profile's CSV-account aliases so
  // a short KPI name (VASSEN) still links to a full allowance name (VASSENTHAN).
  const aliasById = new Map(coachRecords.map((c) => [c.id, c.aliases ?? []]));
  const allowanceRecs: BuildRunAllowanceRec[] = allowanceRuns.map((r) => ({
    coachId: r.coachId,
    canonicalName: r.canonicalName,
    aliases: r.coachId != null ? aliasById.get(r.coachId) ?? [] : [],
    teaching: r.teaching,
  }));

  const coachResults = buildRunCoaches({
    rows,
    config,
    coaches,
    aiClusters,
    allowanceRecs,
    assessmentByCoachId,
  });
  if (coachResults.length === 0) {
    return NextResponse.json(
      {
        error:
          "No coaches could be scored — each needs a teaching allowance and class data. Use the calculator to link allowances first.",
      },
      { status: 422 },
    );
  }

  // Always a draft for review — never auto-finalize an unreviewed merge.
  const runId = await createRun({
    periodLabel: ingest.periodLabel,
    filename: ingest.label || `Delivery #${ingest.id}`,
    csvRows: rows,
    configSnapshot: config,
    coachResults,
    status: "draft",
  });
  // Consume the delivery into the run (links + closes the period), exactly like
  // the dashboard save path.
  await importKpiIngest(ingestId, runId);

  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "kpi_run.autocompute",
      entity: "run",
      entityId: runId,
      summary: `Auto-computed draft KPI run for ${ingest.periodLabel} from upload #${ingest.id} (${coachResults.length} coaches)`,
    });
  }

  return NextResponse.json({ ok: true, runId });
}
