// Pure engine: assemble ONE staff member's earnings across every saved month —
// commission (matched by staff_code, or normalised name) + coaching income
// (matched by normalised name / alias) — into a per-month report. Commission and
// coaching key on different identifiers, so the roster carries a staff_code (for
// commission) and name + aliases (for coaching). Locked by income.test.ts.

import type { StaffCommission } from "@/lib/commission/types";
import type { CoachIncome } from "@/lib/teaching/types";

export interface StaffMonthEarning {
  period: string;
  commission: number;
  coachingIncome: number;
  total: number;
}

export interface StaffEarningsReport {
  months: StaffMonthEarning[];
  totals: { commission: number; coachingIncome: number; total: number };
}

/** Lowercase + strip non-alphanumerics so spacing/case differences still match. */
export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface EarningsMatcher {
  /** Commission staff_code to match exactly (empty = match on name only). */
  staffCode: string;
  /** Normalised name + aliases, for matching commission and coaching by name. */
  names: Set<string>;
}

export function matcherFor(member: { name: string; staffCode: string; aliases?: string[] }): EarningsMatcher {
  const names = new Set([member.name, ...(member.aliases ?? [])].map(normName).filter(Boolean));
  return { staffCode: member.staffCode.trim(), names };
}

/** One saved commission month, reduced to what earnings matching needs. */
export interface CommissionRunSlice {
  periodLabel: string;
  /** Save time (ms) — later saves of the same period win. */
  createdAt: number;
  staff: Pick<StaffCommission, "staffCode" | "staffName" | "commission">[];
}

/** One saved coaching month, reduced to what earnings matching needs. */
export interface TeachingRunSlice {
  periodLabel: string;
  createdAt: number;
  coaches: Pick<CoachIncome, "staffName" | "totalIncome">[];
}

export function staffEarnings(
  matcher: EarningsMatcher,
  commissionRuns: CommissionRunSlice[],
  teachingRuns: TeachingRunSlice[],
): StaffEarningsReport {
  const commissionByPeriod = new Map<string, number>();
  const coachingByPeriod = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  const note = (period: string, ms: number) => {
    const cur = firstSeen.get(period);
    if (cur === undefined || ms < cur) firstSeen.set(period, ms);
  };

  const matchesCommission = (s: { staffCode: string; staffName: string }) =>
    (matcher.staffCode !== "" && s.staffCode === matcher.staffCode) || matcher.names.has(normName(s.staffName));

  // Ascending by save time, so a later save of the same period overwrites.
  for (const run of [...commissionRuns].sort((a, b) => a.createdAt - b.createdAt)) {
    let sum = 0;
    let matched = false;
    for (const s of run.staff) {
      if (matchesCommission(s)) {
        sum += s.commission;
        matched = true;
      }
    }
    if (matched) {
      commissionByPeriod.set(run.periodLabel, sum);
      note(run.periodLabel, run.createdAt);
    }
  }
  for (const run of [...teachingRuns].sort((a, b) => a.createdAt - b.createdAt)) {
    let sum = 0;
    let matched = false;
    for (const c of run.coaches) {
      if (matcher.names.has(normName(c.staffName))) {
        sum += c.totalIncome;
        matched = true;
      }
    }
    if (matched) {
      coachingByPeriod.set(run.periodLabel, sum);
      note(run.periodLabel, run.createdAt);
    }
  }

  const periods = [...new Set([...commissionByPeriod.keys(), ...coachingByPeriod.keys()])].sort(
    (a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0) || a.localeCompare(b),
  );

  const months: StaffMonthEarning[] = periods.map((period) => {
    const commission = commissionByPeriod.get(period) ?? 0;
    const coachingIncome = coachingByPeriod.get(period) ?? 0;
    return { period, commission, coachingIncome, total: commission + coachingIncome };
  });

  const totals = months.reduce(
    (t, m) => ({
      commission: t.commission + m.commission,
      coachingIncome: t.coachingIncome + m.coachingIncome,
      total: t.total + m.total,
    }),
    { commission: 0, coachingIncome: 0, total: 0 },
  );

  return { months, totals };
}
