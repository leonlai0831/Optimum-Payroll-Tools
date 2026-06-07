import Papa from "papaparse";
import { sanitizeSpreadsheetText } from "@/lib/utils";

/** KPI fields the summary needs from one coach in a saved run. */
export interface SummaryKpiInput {
  coachId: number | null;
  canonicalName: string;
  center: string;
  position: string;
  students: number;
  finalScore: number;
  grade: string;
  payout: number;
  teachingAllowance: number | null;
  isComplete: boolean;
}

/** Allowance fields the summary needs from one coach's month. */
export interface SummaryAllowanceInput {
  coachId: number | null;
  canonicalName: string;
  tier: string;
  center: string;
  grandTotal: number;
}

export interface SummaryRow {
  coach: string;
  center: string;
  position: string;
  tier: string;
  /** Null when the coach had an allowance but no KPI bonus that month. */
  kpi: { students: number; score: number; grade: string; bonus: number; complete: boolean } | null;
  allowance: number;
}

export interface MonthlySummary {
  period: string;
  rows: SummaryRow[];
}

/**
 * Join a saved KPI run's coaches with the month's allowance records into one
 * per-coach row each. It's a union: coaches paid an allowance but absent from
 * the KPI run still appear (KPI columns blank). Allowance is matched by coachId
 * first, then canonical name — mirroring how the rest of the app links the two.
 * Rows are sorted by total compensation, highest first.
 */
export function assembleMonthlySummary(
  period: string,
  kpi: SummaryKpiInput[],
  allowance: SummaryAllowanceInput[],
): MonthlySummary {
  const used = new Set<SummaryAllowanceInput>();
  const matchFor = (k: SummaryKpiInput) =>
    allowance.find(
      (a) => (k.coachId != null && a.coachId === k.coachId) || a.canonicalName === k.canonicalName,
    );

  const rows: SummaryRow[] = kpi.map((k) => {
    const a = matchFor(k);
    if (a) used.add(a);
    return {
      coach: k.canonicalName,
      center: k.center,
      position: k.position,
      tier: a?.tier ?? "",
      kpi: {
        students: k.students,
        score: k.finalScore,
        grade: k.grade,
        bonus: k.payout,
        complete: k.isComplete,
      },
      allowance: a?.grandTotal ?? 0,
    };
  });

  for (const a of allowance) {
    if (used.has(a)) continue;
    rows.push({
      coach: a.canonicalName,
      center: a.center,
      position: "",
      tier: a.tier,
      kpi: null,
      allowance: a.grandTotal,
    });
  }

  rows.sort((x, y) => (y.kpi?.bonus ?? 0) + y.allowance - ((x.kpi?.bonus ?? 0) + x.allowance));
  return { period, rows };
}

const HEADER = [
  "Period",
  "Coach",
  "Center",
  "Position",
  "Tier",
  "Students",
  "KPI Score",
  "Grade",
  "KPI Bonus (RM)",
  "Allowance (RM)",
  "Total (RM)",
  "Complete",
] as const;

/**
 * Render the summary as finance-friendly CSV: one row per coach, amounts as
 * plain rounded numbers (so they sum in a spreadsheet) and a trailing TOTAL row.
 * PapaParse quotes any field containing a comma (e.g. multi-center "QSM, BK").
 */
export function buildMonthlySummaryCsv(summary: MonthlySummary): string {
  let sumBonus = 0;
  let sumAllowance = 0;
  let sumTotal = 0;

  const body: (string | number)[][] = summary.rows.map((r) => {
    const bonus = r.kpi?.bonus ?? 0;
    const total = bonus + r.allowance;
    sumBonus += bonus;
    sumAllowance += r.allowance;
    sumTotal += total;
    return [
      // User-derived text is neutralized against spreadsheet formula injection;
      // numeric columns below are left untouched.
      sanitizeSpreadsheetText(summary.period),
      sanitizeSpreadsheetText(r.coach),
      sanitizeSpreadsheetText(r.center),
      sanitizeSpreadsheetText(r.position),
      sanitizeSpreadsheetText(r.tier),
      r.kpi ? r.kpi.students : "",
      r.kpi ? r.kpi.score.toFixed(3) : "",
      r.kpi ? r.kpi.grade : "",
      r.kpi ? Math.round(bonus) : "",
      Math.round(r.allowance),
      Math.round(total),
      r.kpi ? (r.kpi.complete ? "yes" : "no") : "",
    ];
  });

  const totals: (string | number)[] = [
    "",
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    "",
    Math.round(sumBonus),
    Math.round(sumAllowance),
    Math.round(sumTotal),
    "",
  ];

  return Papa.unparse([[...HEADER], ...body, totals]);
}
