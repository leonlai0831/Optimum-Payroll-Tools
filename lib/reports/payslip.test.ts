import { describe, expect, it } from "vitest";
import { buildPayslipPdf, type PayslipData } from "./payslip";

const base: PayslipData = {
  companyName: "Optimum Swim School",
  period: "2026-04",
  generatedAt: new Date("2026-05-01T00:00:00Z"),
  coach: {
    name: "Coby Tan",
    center: "HQ",
    jobRole: "Instructor",
    employmentType: "Full-time",
    tier: "T2",
  },
  kpi: { finalScore: 1.234, grade: "A", students: 180, bonus: 1500 },
  allowance: {
    tier: "T2",
    attendancePct: 0.98,
    attendance: 300,
    teaching: 1200,
    other: 150,
    otherItems: [{ reason: "Event coaching", center: "HQ", amount: 150 }],
    grandTotal: 1650,
  },
};

/** PDF files start with the "%PDF-" magic number. */
const magic = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe("buildPayslipPdf", () => {
  it("produces a non-trivial PDF document", async () => {
    const bytes = await buildPayslipPdf(base);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(800);
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("renders a KPI-only period (no allowance)", async () => {
    const bytes = await buildPayslipPdf({ ...base, allowance: null });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("renders an allowance-only period (no KPI bonus)", async () => {
    const bytes = await buildPayslipPdf({ ...base, kpi: null });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("collapses a long list of other-allowance lines without throwing", async () => {
    const otherItems = Array.from({ length: 20 }, (_, i) => ({
      reason: `Item ${i}`,
      center: "HQ",
      amount: 10,
    }));
    const bytes = await buildPayslipPdf({
      ...base,
      allowance: { ...base.allowance!, otherItems },
    });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("sanitizes non-Latin-1 text (names/notes) instead of throwing", async () => {
    // Smart quotes, accents, and CJK would all break the standard WinAnsi font.
    const bytes = await buildPayslipPdf({
      ...base,
      coach: { ...base.coach, name: "José “Coby” 李小龙 Ñoño" },
      allowance: {
        ...base.allowance!,
        otherItems: [{ reason: "奖金 — bonus", center: "—", amount: 50 }],
      },
    });
    expect(magic(bytes)).toBe("%PDF-");
  });
});
