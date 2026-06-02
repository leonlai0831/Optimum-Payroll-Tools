// Pure engine: merge one month's commission (per staff_code) with coaching income
// (per coach name) into a per-person earnings report. Commission and coaching key
// on different identifiers, so people are matched on a normalised name
// ("DharmeshSundara Raju" == "Dharmesh Sundara Raju"). Locked by income.test.ts.

import type { StaffCommission } from "@/lib/commission/types";
import type { CoachIncome } from "@/lib/teaching/types";

export interface StaffEarnings {
  name: string;
  staffCode: string;
  commission: number;
  coachingIncome: number;
  total: number;
  /** Appeared in the commission run / the coaching upload (for "unmatched" hints). */
  inCommission: boolean;
  inCoaching: boolean;
}

export interface IncomeReport {
  rows: StaffEarnings[];
  totals: { commission: number; coachingIncome: number; total: number };
}

/** Lowercase + strip non-alphanumerics so spacing/case differences still match. */
export function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function mergeIncome(
  commission: Pick<StaffCommission, "staffCode" | "staffName" | "commission">[],
  coaching: Pick<CoachIncome, "staffName" | "totalIncome">[],
): IncomeReport {
  const map = new Map<string, StaffEarnings>();
  const entry = (key: string, name: string): StaffEarnings => {
    let e = map.get(key);
    if (!e) {
      e = {
        name,
        staffCode: "",
        commission: 0,
        coachingIncome: 0,
        total: 0,
        inCommission: false,
        inCoaching: false,
      };
      map.set(key, e);
    }
    return e;
  };

  for (const c of commission) {
    const key = normName(c.staffName) || normName(c.staffCode);
    if (!key) continue;
    const e = entry(key, c.staffName || c.staffCode);
    e.commission += c.commission;
    if (c.staffCode) e.staffCode = c.staffCode;
    if (c.staffName) e.name = c.staffName;
    e.inCommission = true;
  }

  for (const co of coaching) {
    const key = normName(co.staffName);
    if (!key) continue;
    const e = entry(key, co.staffName);
    e.coachingIncome += co.totalIncome;
    if (!e.name) e.name = co.staffName;
    e.inCoaching = true;
  }

  const rows = [...map.values()];
  for (const r of rows) r.total = r.commission + r.coachingIncome;
  rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (t, r) => ({
      commission: t.commission + r.commission,
      coachingIncome: t.coachingIncome + r.coachingIncome,
      total: t.total + r.total,
    }),
    { commission: 0, coachingIncome: 0, total: 0 },
  );

  return { rows, totals };
}
