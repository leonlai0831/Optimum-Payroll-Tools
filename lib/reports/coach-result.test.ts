import { describe, expect, it } from "vitest";
import type { BreakdownItem } from "@/lib/kpi/types";
import type { RunCoach } from "@/lib/types";
import { buildCoachResultPdf } from "./coach-result";

function metric(overrides: Partial<BreakdownItem>): BreakdownItem {
  return {
    id: "students",
    name: "Student Number",
    type: "number",
    min: 140,
    max: 280,
    w: 0.4,
    raw: 180,
    displayValue: "180.00",
    score: 1.18,
    ...overrides,
  };
}

const base: RunCoach = {
  coachId: 1,
  canonicalName: "HONG LI",
  accounts: ["HONG LI [BK]", "HONG LI HARVEST"],
  center: "Berkeley",
  position: "Instructor",
  teachingAllowance: 1200,
  mgmtAssessment: 85,
  groupConfig: null,
  students: 180,
  personalScore: 1.12,
  groupScore: 0,
  finalScore: 1.12,
  grade: "A",
  payout: 1344,
  breakdown: [
    metric({}),
    metric({ id: "upgrade", name: "Upgrade Rate", type: "percent", min: 0.2, max: 0.4, w: 0.12, raw: 0.31, displayValue: "31.00%", score: 1.2 }),
    metric({ id: "progress", name: "Progress Rate", type: "percent", min: 0.7, max: 0.9, w: 0.12, raw: 0.84, displayValue: "84.00%", score: 1.29 }),
    metric({ id: "efficiency", name: "Efficiency Ratio", min: 3, max: 5, w: 0.12, raw: 4.1, displayValue: "4.10", score: 1.21 }),
    metric({ id: "retention", name: "Retention Rate", type: "percent", min: 0.97, max: 0.99, w: 0.12, raw: 0.985, displayValue: "98.50%", score: 1.33 }),
    metric({ id: "mgmt", name: "Mgmt Assessment", min: 70, max: 90, w: 0.12, raw: 85, displayValue: "85.00", score: 1.32 }),
  ],
  isComplete: true,
};

/** PDF files start with the "%PDF-" magic number. */
const magic = (bytes: Uint8Array) => new TextDecoder().decode(bytes.slice(0, 5));

describe("buildCoachResultPdf", () => {
  it("produces a non-trivial PDF document", async () => {
    const bytes = await buildCoachResultPdf({ coach: base, periodLabel: "2026-04" });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(800);
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("renders a supervisor with a group score note", async () => {
    const bytes = await buildCoachResultPdf({
      coach: { ...base, position: "Pool Supervisor", personalScore: 1.1, groupScore: 0.9, finalScore: 1.0 },
      periodLabel: "2026-04",
    });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("skips the radar for fewer than 3 metrics and tolerates an empty breakdown", async () => {
    const two = await buildCoachResultPdf({
      coach: { ...base, breakdown: base.breakdown.slice(0, 2) },
      periodLabel: "2026-04",
    });
    expect(magic(two)).toBe("%PDF-");
    const none = await buildCoachResultPdf({
      coach: { ...base, breakdown: [] },
      periodLabel: "2026-04",
    });
    expect(magic(none)).toBe("%PDF-");
  });

  it("clamps off-scale scores into the radar (uncapped growth, sub-floor)", async () => {
    const bytes = await buildCoachResultPdf({
      coach: {
        ...base,
        breakdown: [
          metric({ score: 2.4 }), // growth is uncapped
          metric({ id: "b", name: "B", score: -0.1 }),
          metric({ id: "c", name: "C", score: 0.5 }),
        ],
      },
      periodLabel: "2026-04",
    });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("renders an incomplete coach with missing inputs", async () => {
    const bytes = await buildCoachResultPdf({
      coach: { ...base, teachingAllowance: null, mgmtAssessment: null, isComplete: false },
      periodLabel: "2026-04",
    });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("sanitizes non-Latin-1 names instead of throwing", async () => {
    // Smart quotes, accents, and CJK would all break the standard WinAnsi font.
    const bytes = await buildCoachResultPdf({
      coach: {
        ...base,
        canonicalName: "José “Coby” 李小龙 Ñoño",
        accounts: ["李小龙 [BK]", "JOSÉ — HARVEST"],
        center: "总部",
      },
      periodLabel: "2026-04",
    });
    expect(magic(bytes)).toBe("%PDF-");
  });

  it("collapses a very long merged-accounts list onto one page", async () => {
    const accounts = Array.from({ length: 60 }, (_, i) => `HONG LI VARIANT ${i} [BK]`);
    const bytes = await buildCoachResultPdf({
      coach: { ...base, accounts },
      periodLabel: "2026-04",
    });
    expect(magic(bytes)).toBe("%PDF-");
  });
});
