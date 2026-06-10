import { describe, expect, it } from "vitest";
import {
  assembleMonthlySummary,
  buildMonthlySummaryCsv,
  type SummaryAllowanceInput,
  type SummaryKpiInput,
} from "./summary";

const kpi = (over: Partial<SummaryKpiInput> & { canonicalName: string }): SummaryKpiInput => ({
  coachId: null,
  center: "HQ",
  position: "Instructor",
  students: 150,
  finalScore: 1.1,
  grade: "A",
  payout: 1000,
  teachingAllowance: 500,
  isComplete: true,
  ...over,
});

const allow = (
  over: Partial<SummaryAllowanceInput> & { canonicalName: string },
): SummaryAllowanceInput => ({
  coachId: null,
  tier: "T2",
  center: "HQ",
  grandTotal: 800,
  ...over,
});

describe("assembleMonthlySummary", () => {
  it("joins KPI and allowance by coachId first, then by name", () => {
    const summary = assembleMonthlySummary(
      "2026-04",
      [kpi({ canonicalName: "A", coachId: 1, payout: 1000 }), kpi({ canonicalName: "B", payout: 500 })],
      [
        allow({ canonicalName: "renamed", coachId: 1, grandTotal: 800 }),
        allow({ canonicalName: "B", grandTotal: 300 }),
      ],
    );
    const a = summary.rows.find((r) => r.coach === "A")!;
    const b = summary.rows.find((r) => r.coach === "B")!;
    expect(a.allowance).toBe(800); // matched by coachId despite the name differing
    expect(b.allowance).toBe(300); // matched by canonical name
    expect(a.kpi?.bonus).toBe(1000);
  });

  it("includes allowance-only coaches (no KPI bonus that month)", () => {
    const summary = assembleMonthlySummary(
      "2026-04",
      [kpi({ canonicalName: "A" })],
      [allow({ canonicalName: "Admin Annie", grandTotal: 400 })],
    );
    const annie = summary.rows.find((r) => r.coach === "Admin Annie")!;
    expect(annie.kpi).toBeNull();
    expect(annie.allowance).toBe(400);
  });

  it("sorts by total compensation, highest first", () => {
    const summary = assembleMonthlySummary(
      "2026-04",
      [
        kpi({ canonicalName: "Low", payout: 100 }),
        kpi({ canonicalName: "High", payout: 2000 }),
      ],
      [],
    );
    expect(summary.rows[0].coach).toBe("High");
  });
});

describe("buildMonthlySummaryCsv", () => {
  it("emits a header, rounded amounts, and a TOTAL row", () => {
    const summary = assembleMonthlySummary(
      "2026-04",
      [kpi({ canonicalName: "Coby", payout: 1000.4 })],
      [allow({ canonicalName: "Coby", grandTotal: 800.6 })],
    );
    const csv = buildMonthlySummaryCsv(summary);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toContain("Coach");
    expect(lines[0]).toContain("Total (RM)");
    expect(csv).toContain("Coby");
    expect(csv).toContain("1000"); // bonus rounded from 1000.4
    expect(csv).toContain("801"); // allowance rounded from 800.6
    expect(csv).toContain("TOTAL");
  });

  it("quotes fields containing commas (multi-center)", () => {
    const summary = assembleMonthlySummary(
      "2026-04",
      [kpi({ canonicalName: "Multi", center: "QSM, BK" })],
      [],
    );
    expect(buildMonthlySummaryCsv(summary)).toContain('"QSM, BK"');
  });

  it("reconciles: printed lines sum to the printed totals (half-ringgit case)", () => {
    // Two coaches with RM10.50 amounts: each line prints as 11, so the printed
    // TOTAL must be 11 + 11 = 22 — NOT round(10.5 + 10.5) = 21. Sum-of-rounded,
    // never rounded-sum.
    const summary = assembleMonthlySummary(
      "2026-04",
      [
        kpi({ canonicalName: "A", payout: 10.5 }),
        kpi({ canonicalName: "B", payout: 10.5 }),
      ],
      [
        allow({ canonicalName: "A", grandTotal: 10.5 }),
        allow({ canonicalName: "B", grandTotal: 10.5 }),
      ],
    );
    const lines = buildMonthlySummaryCsv(summary).trim().split(/\r?\n/);
    const cols = (line: string) => line.split(",");
    const BONUS = 8;
    const ALLOW = 9;
    const TOTAL = 10;

    const rowLines = lines.slice(1, -1);
    const totalLine = cols(lines[lines.length - 1]);
    expect(totalLine[1]).toBe("TOTAL");

    let sumBonus = 0;
    let sumAllow = 0;
    let sumTotal = 0;
    for (const line of rowLines) {
      const c = cols(line);
      const bonus = Number(c[BONUS]);
      const allowance = Number(c[ALLOW]);
      const total = Number(c[TOTAL]);
      expect(bonus).toBe(11); // 10.5 rounds up, once, per line
      expect(allowance).toBe(11);
      expect(total).toBe(bonus + allowance); // each row reconciles
      sumBonus += bonus;
      sumAllow += allowance;
      sumTotal += total;
    }
    // The TOTAL row equals the sum of the printed lines in every money column.
    expect(Number(totalLine[BONUS])).toBe(sumBonus); // 22, not 21
    expect(Number(totalLine[ALLOW])).toBe(sumAllow);
    expect(Number(totalLine[TOTAL])).toBe(sumTotal);
  });
});
