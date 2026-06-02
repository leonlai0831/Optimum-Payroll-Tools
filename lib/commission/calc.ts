// Pure commission engine — no I/O, no exceljs. Operates on already-parsed unified
// rows so it stays trivially unit-testable (locked by calc.test.ts).

import type {
  CommissionConfig,
  CommissionRow,
  CommissionSummary,
  RegistrationStats,
  SalesType,
  StaffCommission,
} from "./types";

/** Keep only digits — used to match a member across files by phone number. */
export function phoneDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

function normText(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Commission is paid in whole ringgit, rounded UP (favouring staff). */
function roundUpRinggit(n: number): number {
  return Math.ceil(n - 1e-9);
}

type IdentityKeys = { phones: Set<string>; names: Set<string>; emails: Set<string> };

/** Identity keys a member could be matched on, gathered from subscription+package rows. */
function subscriberKeys(rows: CommissionRow[]): IdentityKeys {
  const phones = new Set<string>();
  const names = new Set<string>();
  const emails = new Set<string>();
  for (const r of rows) {
    const p = phoneDigits(r.user_phone);
    if (p) phones.add(p);
    const n = normText(r.user_name);
    if (n) names.add(n);
    const e = normText(r.user_email);
    if (e) emails.add(e);
  }
  return { phones, names, emails };
}

/**
 * Did this registration-fee person subscribe to / buy any plan? Match by phone
 * digits first, then fall back to name, then email (per spec).
 */
function registrationSubscribed(reg: CommissionRow, keys: IdentityKeys): boolean {
  const p = phoneDigits(reg.user_phone);
  if (p && keys.phones.has(p)) return true;
  const n = normText(reg.user_name);
  if (n && keys.names.has(n)) return true;
  const e = normText(reg.user_email);
  if (e && keys.emails.has(e)) return true;
  return false;
}

/**
 * Registration counting for the rate: total = all Membership rows; exclude anyone
 * who paid a registration fee but never appears in Subscription OR Package.
 */
export function registrationStats(rows: CommissionRow[]): RegistrationStats {
  const membership = rows.filter((r) => r.sales_type === "Membership");
  const subPkg = rows.filter((r) => r.sales_type === "Subscription" || r.sales_type === "Package");
  const keys = subscriberKeys(subPkg);

  const excluded: string[] = [];
  for (const reg of membership) {
    if (!registrationSubscribed(reg, keys)) excluded.push(reg.user_name.trim() || "(unnamed)");
  }
  const total = membership.length;
  return { total, excluded, qualifying: total - excluded.length };
}

/** Resolve the company-wide rate from the qualifying count. */
export function rateForQualifying(
  qualifying: number,
  config: CommissionConfig,
): { rate: number; belowMin: boolean } {
  const sorted = [...config.bands].sort((a, b) => a.minCount - b.minCount);
  const lowest = sorted[0]?.minCount ?? Number.POSITIVE_INFINITY;
  if (qualifying < lowest) return { rate: config.belowMinRate, belowMin: true };
  for (const b of sorted) {
    if (qualifying >= b.minCount && (b.maxCount == null || qualifying <= b.maxCount)) {
      return { rate: b.rate, belowMin: false };
    }
  }
  // Above all finite maxima with no open-ended band → highest band's rate.
  return { rate: sorted[sorted.length - 1].rate, belowMin: false };
}

function sumBase(rows: CommissionRow[], type: SalesType): number {
  return rows.filter((r) => r.sales_type === type).reduce((s, r) => s + r.subtotal_amount, 0);
}

/** Most common spelling of a name (ties broken by first appearance). */
function mostCommonName(names: string[]): string {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const n of names) {
    if (!n) continue;
    if (!counts.has(n)) order.push(n);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const n of order) {
    const c = counts.get(n) ?? 0;
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Per-staff commission. Base = pre-SST `subtotal_amount`, summed across all three
 * sales types, attributed by staff_code. Rows with a blank staff_code are not
 * commissionable but still feed the "all sales" + "unattributed" reference totals.
 */
export function perStaffCommission(
  rows: CommissionRow[],
  rate: number,
): Pick<CommissionSummary, "staff" | "totals" | "allSalesPreSst" | "unattributedBase"> {
  const byCode = new Map<string, CommissionRow[]>();
  let allSalesPreSst = 0;
  let unattributedBase = 0;

  for (const r of rows) {
    allSalesPreSst += r.subtotal_amount;
    const code = r.staff_code.trim();
    if (!code) {
      unattributedBase += r.subtotal_amount;
      continue;
    }
    const arr = byCode.get(code);
    if (arr) arr.push(r);
    else byCode.set(code, [r]);
  }

  const staff: StaffCommission[] = [];
  for (const [code, rs] of byCode) {
    const sub = sumBase(rs, "Subscription");
    const pkg = sumBase(rs, "Package");
    const reg = sumBase(rs, "Membership");
    const totalBase = sub + pkg + reg;
    staff.push({
      staffCode: code,
      staffName: mostCommonName(rs.map((r) => r.staff_name.trim())),
      transactions: rs.length,
      subscriptionBase: round2(sub),
      packageBase: round2(pkg),
      registrationBase: round2(reg),
      totalBase: round2(totalBase),
      commission: roundUpRinggit(totalBase * rate),
    });
  }

  staff.sort((a, b) => b.commission - a.commission || a.staffCode.localeCompare(b.staffCode));

  const totals = {
    transactions: staff.reduce((s, x) => s + x.transactions, 0),
    subscriptionBase: round2(staff.reduce((s, x) => s + x.subscriptionBase, 0)),
    packageBase: round2(staff.reduce((s, x) => s + x.packageBase, 0)),
    registrationBase: round2(staff.reduce((s, x) => s + x.registrationBase, 0)),
    totalBase: round2(staff.reduce((s, x) => s + x.totalBase, 0)),
    // Per-staff commissions are already whole ringgit; the column sum stays exact.
    commission: staff.reduce((s, x) => s + x.commission, 0),
  };

  return { staff, totals, allSalesPreSst: round2(allSalesPreSst), unattributedBase: round2(unattributedBase) };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Derive a human month label ("April 2026") from the most common paid_at year-month. */
export function monthLabelFromRows(rows: CommissionRow[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const ym = r.paid_at.slice(0, 7); // "yyyy-mm"
    if (/^\d{4}-\d{2}$/.test(ym)) counts.set(ym, (counts.get(ym) ?? 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  for (const [ym, c] of counts) {
    if (c > bestCount) {
      best = ym;
      bestCount = c;
    }
  }
  if (!best) return "Sales";
  const [y, m] = best.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** End-to-end: unified rows + config → full commission summary for one month. */
export function computeCommission(rows: CommissionRow[], config: CommissionConfig): CommissionSummary {
  const registrations = registrationStats(rows);
  const { rate, belowMin } = rateForQualifying(registrations.qualifying, config);
  const perStaff = perStaffCommission(rows, rate);
  return { rate, belowMin, registrations, ...perStaff };
}
