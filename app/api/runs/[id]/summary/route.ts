import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { getRun, listAllowanceRuns, recordAudit } from "@/lib/db/queries";
import { assembleMonthlySummary, buildMonthlySummaryCsv } from "@/lib/reports/summary";

/** UTF-8 byte-order mark, so Excel reads non-ASCII names correctly. */
const BOM = String.fromCharCode(0xfeff);

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]/summary">) {
  // Bulk all-coach pay data — restrict to staff-wide viewers.
  const denied = await requireCapability("view_all_staff");
  if (denied) return denied;

  const { id } = await ctx.params;
  const run = await getRun(Number(id));
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowance = await listAllowanceRuns(run.periodLabel);
  const summary = assembleMonthlySummary(
    run.periodLabel,
    run.coachResults.map((c) => ({
      coachId: c.coachId,
      canonicalName: c.canonicalName,
      center: c.center,
      position: c.position,
      students: c.students,
      finalScore: c.finalScore,
      grade: c.grade,
      payout: c.payout,
      teachingAllowance: c.teachingAllowance,
      isComplete: c.isComplete,
    })),
    allowance.map((a) => ({
      coachId: a.coachId,
      canonicalName: a.canonicalName,
      tier: a.tier,
      center: a.center,
      grandTotal: a.grandTotal,
    })),
  );
  const csv = buildMonthlySummaryCsv(summary);

  const actor = await getCurrentUser();
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "summary.export",
      entity: "run",
      entityId: run.id,
      summary: `Exported monthly summary CSV for ${run.periodLabel} (${summary.rows.length} coaches)`,
    });
  }

  const filename = `kpi-summary-${run.periodLabel}.csv`;
  return new NextResponse(BOM + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
