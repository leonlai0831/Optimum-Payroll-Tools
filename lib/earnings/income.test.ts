import { describe, it, expect } from "vitest";
import { matcherFor, normName, staffEarnings, type CommissionRunSlice, type TeachingRunSlice } from "./income";

describe("normName", () => {
  it("ignores spacing and case so commission/coaching names match", () => {
    expect(normName("DharmeshSundara Raju")).toBe(normName("Dharmesh Sundara Raju"));
    expect(normName("Kah HuiFong")).toBe("kahhuifong");
  });
});

describe("staffEarnings", () => {
  // Dharmesh: commission keyed by staff_code, coaching keyed by name (spelt differently).
  const commissionRuns: CommissionRunSlice[] = [
    {
      periodLabel: "Apr 2026",
      createdAt: 1,
      staff: [
        { staffCode: "CAMRG836", staffName: "DharmeshSundara Raju", commission: 441 },
        { staffCode: "MMH9F737", staffName: "Faisal Ramlee", commission: 2640 },
      ],
    },
    {
      periodLabel: "May 2026",
      createdAt: 2,
      staff: [{ staffCode: "CAMRG836", staffName: "Dharmesh S. Raju", commission: 500 }],
    },
  ];
  const teachingRuns: TeachingRunSlice[] = [
    { periodLabel: "Apr 2026", createdAt: 1, coaches: [{ staffName: "Dharmesh Sundara Raju", totalIncome: 1000 }] },
    { periodLabel: "May 2026", createdAt: 2, coaches: [{ staffName: "Dharmesh Sundara Raju", totalIncome: 1200 }] },
  ];

  it("matches commission by staff_code and coaching by normalised name, per month", () => {
    const r = staffEarnings(
      matcherFor({ name: "Dharmesh Sundara Raju", staffCode: "CAMRG836", aliases: [] }),
      commissionRuns,
      teachingRuns,
    );
    expect(r.months.map((m) => m.period)).toEqual(["Apr 2026", "May 2026"]); // ordered by first save
    const apr = r.months[0];
    expect(apr.commission).toBe(441);
    expect(apr.coachingIncome).toBe(1000);
    expect(apr.total).toBe(1441);
    expect(r.totals).toEqual({ commission: 941, coachingIncome: 2200, total: 3141 });
  });

  it("matches coaching by alias when the roster name differs from the export", () => {
    const r = staffEarnings(
      matcherFor({ name: "Faisal Ramlee", staffCode: "MMH9F737", aliases: ["Coach Faisal"] }),
      commissionRuns,
      [{ periodLabel: "Apr 2026", createdAt: 1, coaches: [{ staffName: "Coach Faisal", totalIncome: 300 }] }],
    );
    expect(r.months).toHaveLength(1);
    expect(r.months[0]).toMatchObject({ period: "Apr 2026", commission: 2640, coachingIncome: 300, total: 2940 });
  });

  it("a later save of the same period wins; months with no match are omitted", () => {
    const r = staffEarnings(
      matcherFor({ name: "Dharmesh Sundara Raju", staffCode: "CAMRG836", aliases: [] }),
      [
        ...commissionRuns,
        // Re-save of Apr with a corrected figure — latest createdAt wins.
        { periodLabel: "Apr 2026", createdAt: 9, staff: [{ staffCode: "CAMRG836", staffName: "Dharmesh", commission: 450 }] },
      ],
      teachingRuns,
    );
    expect(r.months.find((m) => m.period === "Apr 2026")!.commission).toBe(450);
  });

  it("excludes people who never appear in any run", () => {
    const r = staffEarnings(matcherFor({ name: "Nobody Here", staffCode: "", aliases: [] }), commissionRuns, teachingRuns);
    expect(r.months).toHaveLength(0);
    expect(r.totals.total).toBe(0);
  });
});
