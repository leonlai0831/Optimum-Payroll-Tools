// Optimum Fit monthly commission — domain types.
//
// The flow: 3 monthly .xlsx exports (Membership / Subscription / Package) are
// parsed into ONE unified row shape (`CommissionRow`), then the pure engine in
// `calc.ts` derives the company-wide rate (from qualifying registrations) and the
// per-staff commission (base = pre-SST subtotal, attributed by staff_code).

export type SalesType = "Membership" | "Subscription" | "Package";

/**
 * One sales row in the unified schema (Tab 1 "All Sales"). Amounts are numbers;
 * `user_phone` / `staff_phone` / `payment_transaction_id` are kept as exact digit
 * STRINGS so large integers never render in scientific notation. Missing values
 * (the literal "NULL" in the source) become "" / null here.
 */
export interface CommissionRow {
  sales_type: SalesType;
  user_name: string;
  user_email: string;
  user_phone: string;
  staff_name: string;
  staff_email: string;
  staff_phone: string;
  staff_code: string;
  payment_transaction_id: string;
  /** Normalised "yyyy-mm-dd hh:mm:ss". */
  paid_at: string;
  /** Pre-SST amount — the commission base. (Membership file's `subtotal`.) */
  subtotal_amount: number;
  tax_amount: number;
  /** null for Membership rows (that file has no such column). */
  membership_redemption_amount: number | null;
  total_amount: number;
  plan_identifier_at_purchased: string;
  plan_identifier_at_present: string;
}

/** A qualifying-registration-count band → commission rate. `maxCount: null` = open-ended (e.g. 120+). */
export interface RateBand {
  minCount: number;
  maxCount: number | null;
  /** Commission rate as a fraction, e.g. 0.06 for 6%. */
  rate: number;
}

/** Editable in /commission/settings. Defaults reproduce the spec bands. */
export interface CommissionConfig {
  /** Bands applied to the month's qualifying-registration count. */
  bands: RateBand[];
  /** Rate used (and flagged) when qualifying count is below the lowest band. */
  belowMinRate: number;
}

export interface RegistrationStats {
  /** All registration-fee rows = every row in the Membership file. */
  total: number;
  /** Names of registration-only people (registered but never subscribed/bought a pack). */
  excluded: string[];
  /** total − excluded.length — drives the rate band. */
  qualifying: number;
}

/** One staff member's commission line (Tab 2). */
export interface StaffCommission {
  staffCode: string;
  /** Most common spelling of staff_name seen for this code. */
  staffName: string;
  transactions: number;
  subscriptionBase: number;
  packageBase: number;
  registrationBase: number;
  totalBase: number;
  commission: number;
}

/** Full result of the engine for one month. */
export interface CommissionSummary {
  rate: number;
  /** Qualifying count fell below the lowest band (rate 0) — surface a warning. */
  belowMin: boolean;
  registrations: RegistrationStats;
  /** Per-staff lines, sorted by commission desc. */
  staff: StaffCommission[];
  totals: {
    transactions: number;
    subscriptionBase: number;
    packageBase: number;
    registrationBase: number;
    totalBase: number;
    commission: number;
  };
  /** Sum of subtotal over ALL rows, including unattributed — reference row. */
  allSalesPreSst: number;
  /** Subtotal of rows with a blank/NULL staff_code — NOT commissionable. */
  unattributedBase: number;
}
