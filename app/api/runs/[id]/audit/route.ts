import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/permissions";
import { getRun, listAllowanceRuns, listCoaches } from "@/lib/db/queries";
import { auditRun, type AuditCoach, type AuditAllowanceRec } from "@/lib/kpi/audit";
import { narrateAudit } from "@/lib/ai/anthropic";

/**
 * GET a deterministic bonus/allowance audit for one run, plus an AI narration.
 * The findings are computed in lib/kpi/audit.ts (pure, testable); the AI only
 * summarizes them.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireCapability("run_kpi");
  if (denied) return denied;
  const { id } = await ctx.params;
  const run = await getRun(Number(id));
  if (!run) return NextResponse.json({ error: "run not found" }, { status: 404 });

  const coaches: AuditCoach[] = run.coachResults.map((c) => ({
    coachId: c.coachId,
    canonicalName: c.canonicalName,
    accounts: c.accounts,
    teachingAllowance: c.teachingAllowance,
    finalScore: c.finalScore,
    payout: c.payout,
    isComplete: c.isComplete,
  }));

  // Same-month allowance records, enriched with each coach profile's account
  // aliases (by coachId) so a short KPI name can still match a full-name
  // allowance record — mirrors how the leaderboard links the two.
  const [allowanceRecs, profiles] = await Promise.all([
    listAllowanceRuns(run.periodLabel),
    listCoaches(),
  ]);
  const aliasById = new Map(profiles.map((p) => [p.id, p.aliases ?? []]));
  const allowances: AuditAllowanceRec[] = allowanceRecs.map((a) => ({
    coachId: a.coachId,
    canonicalName: a.canonicalName,
    teaching: a.teaching,
    aliases: a.coachId != null ? aliasById.get(a.coachId) ?? [] : [],
  }));

  const findings = auditRun(coaches, allowances);
  const summary = await narrateAudit(
    findings.map((f) => ({ coach: f.coach, severity: f.severity, message: f.message })),
  );

  return NextResponse.json({ findings, summary });
}
