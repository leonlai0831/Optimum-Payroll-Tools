import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import {
  deleteRun,
  getRun,
  recordAudit,
  reopenRun,
  runStatusFromResults,
  updateRunReview,
} from "@/lib/db/queries";
import type { RunCoach } from "@/lib/types";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  // A saved run holds per-coach bonus/pay data — same gate as the list + siblings.
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const { id } = await ctx.params;
  const run = await getRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}

/**
 * Save a management review onto a draft run: the (client-recomputed) coach results
 * — updated mgmt scores and/or corrected account links — plus whether to finalize.
 * Also handles `reopen` — reverting a finalized month back to an editable draft.
 * Gated on `finalize_kpi` (admin + super_admin). Finalizing requires every coach
 * complete; otherwise the month stays a draft.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const denied = await requireCapability("finalize_kpi");
  if (denied) return denied;
  const actor = await getCurrentUser();
  const { id } = await ctx.params;
  const runId = Number(id);
  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    coachResults?: RunCoach[];
    finalize?: boolean;
    reopen?: boolean;
  };

  // Reopen a finalized month for correction — the inverse of finalizing, behind the
  // same `finalize_kpi` gate. Flips it back to an editable draft; no body needed.
  if (body.reopen) {
    const reopened = await reopenRun(runId);
    if (actor && reopened) {
      await recordAudit({
        actorId: actor.id,
        actorEmail: actor.email,
        action: "kpi_run.reopen",
        entity: "run",
        entityId: runId,
        summary: `Reopened ${run.periodLabel} for edits`,
      });
    }
    return NextResponse.json({ ok: true, status: "draft" });
  }

  if (!Array.isArray(body.coachResults)) {
    return NextResponse.json({ error: "coachResults is required" }, { status: 400 });
  }
  const allComplete = runStatusFromResults(body.coachResults) === "finalized";
  if (body.finalize && !allComplete) {
    return NextResponse.json(
      { error: "Cannot finalize — some coaches are still incomplete." },
      { status: 400 },
    );
  }
  const status = body.finalize ? "finalized" : "draft";
  await updateRunReview(runId, body.coachResults, status);
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: status === "finalized" ? "kpi_run.finalize" : "kpi_run.review",
      entity: "run",
      entityId: runId,
      summary: `${status === "finalized" ? "Finalized" : "Saved review for"} ${run.periodLabel} (${body.coachResults.length} coaches)`,
    });
  }
  return NextResponse.json({ ok: true, status });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const { id } = await ctx.params;
  await deleteRun(Number(id));
  return NextResponse.json({ ok: true });
}
