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

/** Commission matches on exact staff_code (when set) or normalised name. */
export function matchesCommission(m: EarningsMatcher, s: { staffCode: string; staffName: string }): boolean {
  return (m.staffCode !== "" && s.staffCode === m.staffCode) || m.names.has(normName(s.staffName));
}

/** Coaching only carries a name, so it matches on normalised name / alias. */
export function matchesCoaching(m: EarningsMatcher, c: { staffName: string }): boolean {
  return m.names.has(normName(c.staffName));
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

  // Ascending by save time, so a later save of the same period overwrites.
  for (const run of [...commissionRuns].sort((a, b) => a.createdAt - b.createdAt)) {
    let sum = 0;
    let matched = false;
    for (const s of run.staff) {
      if (matchesCommission(matcher, s)) {
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
      if (matchesCoaching(matcher, c)) {
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

export interface StaffMonthDetail {
  /** The member's commission line for the month (aggregated if >1 match), or null. */
  commission: StaffCommission | null;
  /** The member's coaching line incl. per-class breakdown, or null. */
  coaching: CoachIncome | null;
  total: number;
}

/** One member's detail for a single month: their commission line + coaching line. */
export function extractStaffMonth(
  matcher: EarningsMatcher,
  commissionStaff: StaffCommission[],
  coaches: CoachIncome[],
): StaffMonthDetail {
  const matchedC = commissionStaff.filter((s) => matchesCommission(matcher, s));
  const matchedT = coaches.filter((c) => matchesCoaching(matcher, c));

  const commission = matchedC.length
    ? matchedC.reduce<StaffCommission>(
        (a, s) => ({
          staffCode: a.staffCode || s.staffCode,
          staffName: a.staffName || s.staffName,
          transactions: a.transactions + s.transactions,
          subscriptionBase: a.subscriptionBase + s.subscriptionBase,
          packageBase: a.packageBase + s.packageBase,
          registrationBase: a.registrationBase + s.registrationBase,
          totalBase: a.totalBase + s.totalBase,
          commission: a.commission + s.commission,
        }),
        { staffCode: "", staffName: "", transactions: 0, subscriptionBase: 0, packageBase: 0, registrationBase: 0, totalBase: 0, commission: 0 },
      )
    : null;

  const coaching = matchedT.length
    ? matchedT.reduce<CoachIncome>(
        (a, c) => ({
          staffName: a.staffName || c.staffName,
          ptSessions: a.ptSessions + c.ptSessions,
          ptAttendees: a.ptAttendees + c.ptAttendees,
          groupSessions: a.groupSessions + c.groupSessions,
          groupAttendees: a.groupAttendees + c.groupAttendees,
          ptIncome: a.ptIncome + c.ptIncome,
          groupIncome: a.groupIncome + c.groupIncome,
          totalIncome: a.totalIncome + c.totalIncome,
          classes: [...a.classes, ...c.classes],
        }),
        { staffName: "", ptSessions: 0, ptAttendees: 0, groupSessions: 0, groupAttendees: 0, ptIncome: 0, groupIncome: 0, totalIncome: 0, classes: [] },
      )
    : null;

  return { commission, coaching, total: (commission?.commission ?? 0) + (coaching?.totalIncome ?? 0) };
}
