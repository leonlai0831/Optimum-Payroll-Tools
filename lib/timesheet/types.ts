// Pure domain types for the clock-in / timesheet system (P1 foundation).
// No DB or React imports — locked by Vitest like the freelancer/allowance
// engines, because the hours it produces flow straight into payroll.
//
// Two clock-in modes, by role:
//   - lesson (instructors):              a class of a given type + duration.
//   - shift  (freelance front desk):     a start–end shift, no class type.
// For FREELANCERS, the fixed/replaced classification and absence are DERIVED by
// reconciling against their fixed schedule (see reconcile.ts), never hand-typed.

/** The 7 clock-in class types an instructor reports (operator, 2026-06-13). */
export const TIMESHEET_CLASS_TYPES = [
  "low",
  "medium",
  "high",
  "adult",
  "youngSwimmer",
  "precomp",
  "lifesaving",
] as const;
export type TimesheetClassType = (typeof TIMESHEET_CLASS_TYPES)[number];

export const TIMESHEET_CLASS_TYPE_LABELS: Record<TimesheetClassType, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  adult: "Adult",
  youngSwimmer: "Young Swimmer",
  precomp: "Precomp",
  lifesaving: "Lifesaving",
};

/** lesson = a class (instructor); shift = a start–end span (front-desk freelancer). */
export const TIMESHEET_ENTRY_TYPES = ["lesson", "shift"] as const;
export type TimesheetEntryType = (typeof TIMESHEET_ENTRY_TYPES)[number];

export const SLOT_TYPES = ["fixed", "replaced"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

/**
 * The three allowance teaching-rate buckets (mirrors `TeachingRates` keys in
 * lib/allowance/types.ts). The 7 clock-in class types fold into these WITHOUT
 * changing the rate table (operator decision, 2026-06-13):
 *   low / medium / high / adult → normal
 *   youngSwimmer                → youngSwimmer
 *   precomp / lifesaving        → precompLifesaving
 */
export type TeachingBucket = "normal" | "youngSwimmer" | "precompLifesaving";

export function teachingBucketOf(classType: TimesheetClassType): TeachingBucket {
  if (classType === "youngSwimmer") return "youngSwimmer";
  if (classType === "precomp" || classType === "lifesaving") return "precompLifesaving";
  return "normal"; // low, medium, high, adult — learn-to-swim
}
