import type { CommissionConfig, RateBand } from "./types";

/**
 * v1 commission rate bands from the Optimum Fit monthly spec. A single
 * company-wide rate is chosen by the month's *qualifying* registration count
 * (total registrations minus registration-only members). Below 40 → 0% (flagged).
 */
export const DEFAULT_RATE_BANDS: RateBand[] = [
  { minCount: 40, maxCount: 59, rate: 0.06 },
  { minCount: 60, maxCount: 79, rate: 0.07 },
  { minCount: 80, maxCount: 99, rate: 0.08 },
  { minCount: 100, maxCount: 119, rate: 0.09 },
  { minCount: 120, maxCount: null, rate: 0.1 },
];

export const DEFAULT_COMMISSION_CONFIG: CommissionConfig = {
  bands: DEFAULT_RATE_BANDS,
  belowMinRate: 0,
};

/** Clone so callers can edit a draft without mutating the shared default. */
export function defaultCommissionConfig(): CommissionConfig {
  return structuredClone(DEFAULT_COMMISSION_CONFIG);
}
