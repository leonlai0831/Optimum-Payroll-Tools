/**
 * Deterministic bonus/allowance audit. This is payroll, so the *judgement* of
 * what's wrong is a pure function (testable, never AI) — Claude is only used
 * elsewhere to narrate the findings this produces.
 *
 * It cross-checks a finalized KPI run against the same month's allowance records
 * and flags inconsistencies a human should resolve before paying out.
 */

import { linkAllowance } from "./allowance-link";

export interface AuditCoach {
  coachId: number | null;
  canonicalName: string;
  /** The raw CSV account names merged into this coach (for alias matching). */
  accounts: string[];
  /** The teaching allowance the KPI run actually used to compute payout. */
  teachingAllowance: number | null;
  finalScore: number;
  payout: number;
  isComplete: boolean;
}

export interface AuditAllowanceRec {
  coachId: number | null;
  canonicalName: string;
  /** The teaching subtotal from the allowance calculator (what *should* link). */
  teaching: number;
  /** Account names this allowance's coach was saved under (for alias matching). */
  aliases?: string[];
}

export type AuditKind =
  | "allowance_mismatch" // KPI's teaching allowance ≠ allowance calc's teaching subtotal
  | "payout_formula" // payout ≠ finalScore × teachingAllowance (should never happen)
  | "paid_incomplete" // a non-zero payout on a coach still missing required inputs
  | "no_allowance_record"; // coach got paid but has no matching allowance record

export interface AuditFinding {
  coach: string;
  kind: AuditKind;
  severity: "high" | "medium" | "low";
  message: string;
}

/** Round to cents for tolerant float comparison (avoid 1199.9999 ≠ 1200). */
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compare a run's coaches against the month's allowance records. Records are
 * matched to coaches with the same deterministic ladder the leaderboard uses
 * (`linkAllowance`: coachId / exact / normalized / account alias), so a short
 * KPI name still finds its full-name allowance record.
 */
export function auditRun(
  coaches: AuditCoach[],
  allowances: AuditAllowanceRec[],
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const c of coaches) {
    const used = c.teachingAllowance ?? 0;

    // 1. payout must equal finalScore × allowance (guards against stale/edited data).
    const expected = money(c.finalScore * used);
    if (money(c.payout) !== expected) {
      findings.push({
        coach: c.canonicalName,
        kind: "payout_formula",
        severity: "high",
        message: `Payout ${money(c.payout)} ≠ score ${c.finalScore.toFixed(2)} × allowance ${used} (= ${expected}).`,
      });
    }

    // 2. a non-zero payout on an incomplete coach (missing required inputs).
    if (money(c.payout) > 0 && !c.isComplete) {
      findings.push({
        coach: c.canonicalName,
        kind: "paid_incomplete",
        severity: "high",
        message: `Paid ${money(c.payout)} but the coach is still marked incomplete (missing required inputs).`,
      });
    }

    // 3. cross-check the teaching allowance against the allowance calculator.
    if (used > 0) {
      const rec = linkAllowance(allowances, {
        coachId: c.coachId,
        canonicalName: c.canonicalName,
        accounts: c.accounts,
      }).rec;
      if (rec === null) {
        findings.push({
          coach: c.canonicalName,
          kind: "no_allowance_record",
          severity: "medium",
          message: `Used a teaching allowance of ${used} but has no matching allowance record this month.`,
        });
      } else if (money(rec.teaching) !== money(used)) {
        findings.push({
          coach: c.canonicalName,
          kind: "allowance_mismatch",
          severity: "high",
          message: `KPI used allowance ${used}, but the allowance calculator has ${money(rec.teaching)} for this coach — payout may be wrong.`,
        });
      }
    }
  }

  return findings;
}
