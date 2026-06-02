import { describe, it, expect } from "vitest";
import { mergeIncome, normName } from "./income";

describe("normName", () => {
  it("ignores spacing and case so commission/coaching names match", () => {
    expect(normName("DharmeshSundara Raju")).toBe(normName("Dharmesh Sundara Raju"));
    expect(normName("Kah HuiFong")).toBe("kahhuifong");
  });
});

describe("mergeIncome", () => {
  const commission = [
    { staffCode: "CAMRG836", staffName: "DharmeshSundara Raju", commission: 441 },
    { staffCode: "NOAXA740", staffName: "Kah HuiFong", commission: 622 },
    { staffCode: "MMH9F737", staffName: "FaisalRamlee", commission: 2640 },
  ];
  const coaching = [
    { staffName: "Dharmesh Sundara Raju", totalIncome: 1000 },
    { staffName: "Kah Hui Fong", totalIncome: 2000 },
    { staffName: "New Freelancer", totalIncome: 500 },
  ];
  const report = mergeIncome(commission, coaching);

  it("combines commission + coaching for the same person across spelling differences", () => {
    const dharmesh = report.rows.find((r) => r.staffCode === "CAMRG836")!;
    expect(dharmesh.commission).toBe(441);
    expect(dharmesh.coachingIncome).toBe(1000);
    expect(dharmesh.total).toBe(1441);
    expect(dharmesh.inCommission && dharmesh.inCoaching).toBe(true);
  });

  it("keeps coaching-only people (e.g. freelancers) with no commission", () => {
    const fl = report.rows.find((r) => r.name === "New Freelancer")!;
    expect(fl.commission).toBe(0);
    expect(fl.coachingIncome).toBe(500);
    expect(fl.inCommission).toBe(false);
  });

  it("sorts by total desc and totals correctly", () => {
    expect(report.rows[0].name).toBe("FaisalRamlee"); // 2640
    expect(report.totals.commission).toBe(3703);
    expect(report.totals.coachingIncome).toBe(3500);
    expect(report.totals.total).toBe(7203);
  });
});
