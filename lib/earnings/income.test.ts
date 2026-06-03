import { describe, it, expect } from "vitest";
import {
  extractStaffMonth,
  matcherFor,
  normName,
  staffEarnings,
  unmatchedEarners,
  type CommissionRunSlice,
  type TeachingRunSlice,
} from "./income";

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

describe("extractStaffMonth", () => {
  const commissionStaff = [
    { staffCode: "CAMRG836", staffName: "Dharmesh S. Raju", transactions: 4, subscriptionBase: 800, packageBase: 200, registrationBase: 100, totalBase: 1100, commission: 441 },
    { staffCode: "ZZZ", staffName: "Someone Else", transactions: 1, subscriptionBase: 1, packageBase: 0, registrationBase: 0, totalBase: 1, commission: 1 },
  ];
  const coaches = [
    {
      staffName: "Dharmesh Sundara Raju",
      ptSessions: 2, ptAttendees: 3, groupSessions: 1, groupAttendees: 5, ptIncome: 90, groupIncome: 75, totalIncome: 165,
      classes: [
        { className: "Fitness Appointment", kind: "pt" as const, sessions: 2, attendees: 3, income: 90 },
        { className: "Strength", kind: "group" as const, sessions: 1, attendees: 5, income: 75 },
      ],
    },
  ];

  it("pulls one person's commission line + coaching line (with classes) for the month", () => {
    const d = extractStaffMonth(matcherFor({ name: "Dharmesh Sundara Raju", staffCode: "CAMRG836", aliases: [] }), commissionStaff, coaches);
    expect(d.commission?.commission).toBe(441);
    expect(d.commission?.totalBase).toBe(1100);
    expect(d.coaching?.totalIncome).toBe(165);
    expect(d.coaching?.classes).toHaveLength(2);
    expect(d.total).toBe(606); // 441 + 165
  });

  it("returns null sides when the person has no commission or no coaching that month", () => {
    const d = extractStaffMonth(matcherFor({ name: "Coach Only", staffCode: "", aliases: [] }), commissionStaff, [
      { ...coaches[0], staffName: "Coach Only" },
    ]);
    expect(d.commission).toBeNull();
    expect(d.coaching?.totalIncome).toBe(165);
    expect(d.total).toBe(165);
  });
});

describe("unmatchedEarners", () => {
  const roster = [{ name: "Faisal Ramlee", staffCode: "MMH9F737", aliases: [] }];
  const commissionRuns: CommissionRunSlice[] = [
    {
      periodLabel: "Apr 2026",
      createdAt: 1,
      staff: [
        { staffCode: "MMH9F737", staffName: "Faisal Ramlee", commission: 2640 }, // roster-matched (code)
        { staffCode: "GHOST1", staffName: "Ghost Person", commission: 100 }, // commission-only, unmatched
        { staffCode: "DUO9", staffName: "Duo Coach", commission: 50 }, // also in coaching → both
      ],
    },
  ];
  const teachingRuns: TeachingRunSlice[] = [
    {
      periodLabel: "Apr 2026",
      createdAt: 1,
      coaches: [
        { staffName: "Faisal Ramlee", totalIncome: 300 }, // roster-matched (name)
        { staffName: "New Freelancer", totalIncome: 500 }, // coaching-only, unmatched
        { staffName: "Duo Coach", totalIncome: 200 },
      ],
    },
  ];
  const result = unmatchedEarners(roster, commissionRuns, teachingRuns);

  it("excludes roster-matched people (by code or by name)", () => {
    expect(result.find((e) => e.name === "Faisal Ramlee")).toBeUndefined();
  });

  it("flags commission-only, coaching-only, and both — with amounts", () => {
    expect(result.find((e) => e.name === "Ghost Person")).toMatchObject({ source: "commission", total: 100 });
    expect(result.find((e) => e.name === "New Freelancer")).toMatchObject({ source: "coaching", totalCoaching: 500 });
    expect(result.find((e) => e.name === "Duo Coach")).toMatchObject({ source: "both", total: 250, months: 1 });
  });

  it("sorts by total desc", () => {
    expect(result.map((e) => e.name)).toEqual(["New Freelancer", "Duo Coach", "Ghost Person"]);
  });
});
