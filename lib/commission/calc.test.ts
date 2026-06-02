import { describe, it, expect } from "vitest";
import {
  computeCommission,
  perStaffCommission,
  phoneDigits,
  rateForQualifying,
  registrationStats,
} from "./calc";
import { DEFAULT_COMMISSION_CONFIG } from "./defaults";
import type { CommissionConfig, CommissionRow, SalesType } from "./types";

function row(p: Partial<CommissionRow> & { sales_type: SalesType }): CommissionRow {
  return {
    sales_type: p.sales_type,
    user_name: p.user_name ?? "",
    user_email: p.user_email ?? "",
    user_phone: p.user_phone ?? "",
    staff_name: p.staff_name ?? "",
    staff_email: p.staff_email ?? "",
    staff_phone: p.staff_phone ?? "",
    staff_code: p.staff_code ?? "",
    payment_transaction_id: p.payment_transaction_id ?? "",
    paid_at: p.paid_at ?? "2026-04-01 00:00:00",
    subtotal_amount: p.subtotal_amount ?? 0,
    tax_amount: p.tax_amount ?? 0,
    membership_redemption_amount: p.membership_redemption_amount ?? null,
    total_amount: p.total_amount ?? 0,
    plan_identifier_at_purchased: p.plan_identifier_at_purchased ?? "",
    plan_identifier_at_present: p.plan_identifier_at_present ?? "",
  };
}

// A small hand-computed month. Alice + Bob + Eve subscribe; Carol + Dave only
// paid a registration fee. Carol's reg has no staff_code (unattributed); Dave's
// reg carries staff_code S1 (still earns, even though excluded from the rate count).
const FIXTURE: CommissionRow[] = [
  // Membership / registration fees
  row({ sales_type: "Membership", user_name: "Alice", user_phone: "111", staff_code: "S1", staff_name: "Coach A", subtotal_amount: 50 }),
  row({ sales_type: "Membership", user_name: "Bob", user_phone: "222", staff_code: "S2", staff_name: "Coach B", subtotal_amount: 50 }),
  row({ sales_type: "Membership", user_name: "Carol", user_phone: "333", staff_code: "", subtotal_amount: 100 }),
  row({ sales_type: "Membership", user_name: "Dave", user_phone: "444", staff_code: "S1", staff_name: "Coach A", subtotal_amount: 0 }),
  row({ sales_type: "Membership", user_name: "Eve", user_phone: "", user_email: "eve@x.com", staff_code: "S2", staff_name: "Coach B", subtotal_amount: 50 }),
  // Subscriptions
  row({ sales_type: "Subscription", user_name: "Alice", user_phone: "111", staff_code: "S1", staff_name: "Coach A", subtotal_amount: 200 }),
  row({ sales_type: "Subscription", user_name: "Bob", user_phone: "222", staff_code: "S2", staff_name: "Coach B", subtotal_amount: 300 }),
  row({ sales_type: "Subscription", user_name: "Eve", user_phone: "", user_email: "eve@x.com", staff_code: "S2", staff_name: "Coach B", subtotal_amount: 100 }),
  // Packages
  row({ sales_type: "Package", user_name: "Alice", user_phone: "111", staff_code: "S1", staff_name: "Coach A", subtotal_amount: 500 }),
];

// Tiny bands so the fixture (qualifying = 3) lands in a known band.
const TEST_CONFIG: CommissionConfig = {
  bands: [
    { minCount: 2, maxCount: 3, rate: 0.06 },
    { minCount: 4, maxCount: null, rate: 0.1 },
  ],
  belowMinRate: 0,
};

describe("phoneDigits", () => {
  it("strips non-digits", () => {
    expect(phoneDigits("+60 12-345 6789")).toBe("60123456789");
    expect(phoneDigits(null)).toBe("");
  });
});

describe("registrationStats", () => {
  it("counts all membership rows and excludes registration-only people", () => {
    const s = registrationStats(FIXTURE);
    expect(s.total).toBe(5);
    expect(s.qualifying).toBe(3);
    expect([...s.excluded].sort()).toEqual(["Carol", "Dave"]);
  });

  it("matches a subscriber by email when phone is missing (Eve is NOT excluded)", () => {
    const s = registrationStats(FIXTURE);
    expect(s.excluded).not.toContain("Eve");
  });
});

describe("rateForQualifying (default spec bands)", () => {
  const cases: Array<[number, number, boolean]> = [
    [0, 0, true],
    [39, 0, true],
    [40, 0.06, false],
    [59, 0.06, false],
    [60, 0.07, false],
    [99, 0.08, false],
    [100, 0.09, false],
    [119, 0.09, false],
    [120, 0.1, false],
    [250, 0.1, false],
  ];
  it.each(cases)("qualifying=%i → rate %f (belowMin=%s)", (q, rate, belowMin) => {
    const r = rateForQualifying(q, DEFAULT_COMMISSION_CONFIG);
    expect(r.rate).toBe(rate);
    expect(r.belowMin).toBe(belowMin);
  });
});

describe("perStaffCommission (base = pre-SST subtotal, by staff_code)", () => {
  const res = perStaffCommission(FIXTURE, 0.06);

  it("attributes subscription / package / registration base correctly", () => {
    const s1 = res.staff.find((s) => s.staffCode === "S1")!;
    expect(s1.subscriptionBase).toBe(200);
    expect(s1.packageBase).toBe(500);
    expect(s1.registrationBase).toBe(50); // Alice 50 + Dave 0
    expect(s1.totalBase).toBe(750);
    expect(s1.transactions).toBe(4);
    expect(s1.commission).toBe(45); // 750 * 0.06
    expect(s1.staffName).toBe("Coach A");
  });

  it("sorts by commission desc and totals correctly", () => {
    expect(res.staff.map((s) => s.staffCode)).toEqual(["S1", "S2"]);
    expect(res.totals.totalBase).toBe(1250);
    expect(res.totals.commission).toBe(75); // 45 + 30
  });

  it("tracks all-sales and unattributed (Carol's RM100 reg) reference totals", () => {
    expect(res.allSalesPreSst).toBe(1350);
    expect(res.unattributedBase).toBe(100);
    // attributed base + unattributed base == all sales pre-SST
    expect(res.totals.totalBase + res.unattributedBase).toBe(res.allSalesPreSst);
  });
});

describe("computeCommission (end-to-end)", () => {
  it("derives rate from qualifying registrations, then per-staff commission", () => {
    const sum = computeCommission(FIXTURE, TEST_CONFIG);
    expect(sum.registrations.qualifying).toBe(3);
    expect(sum.rate).toBe(0.06);
    expect(sum.belowMin).toBe(false);
    expect(sum.staff[0].staffCode).toBe("S1");
    expect(sum.totals.commission).toBe(75);
    expect(sum.unattributedBase).toBe(100);
  });

  it("flags below-minimum qualifying counts (rate 0)", () => {
    const onlyOne = FIXTURE.filter((r) => r.user_name === "Alice");
    const sum = computeCommission(onlyOne, DEFAULT_COMMISSION_CONFIG);
    expect(sum.belowMin).toBe(true);
    expect(sum.rate).toBe(0);
    expect(sum.totals.commission).toBe(0);
  });
});
