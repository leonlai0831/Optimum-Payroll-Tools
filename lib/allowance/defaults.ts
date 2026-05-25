import type { AllowanceConfig } from "./types";

/** Standard attendance amounts shared by most tiers. */
const STD_ATT = { met: 200, perfect: 300 };

/**
 * Default rate tables, faithful to FULLTIME_CALCULATOR.xlsx. Every tier must appear
 * in BOTH maps (TypeScript enforces totality on `Record<AllowanceTier, …>`).
 * Admin tiers A1–A3 (and PA) carry no teaching rate; precomp/lifesaving is I2/I3 only.
 */
export const DEFAULT_ALLOWANCE_CONFIG: AllowanceConfig = {
  attendance: {
    A1: { ...STD_ATT },
    A2: { ...STD_ATT },
    A3: { ...STD_ATT },
    PA: { ...STD_ATT },
    T0: { ...STD_ATT },
    T1: { ...STD_ATT },
    T2: { ...STD_ATT },
    T3: { ...STD_ATT },
    T4: { ...STD_ATT },
    I1: { ...STD_ATT },
    I2: { met: 270, perfect: 400 },
    I3: { met: 350, perfect: 500 },
  },
  teaching: {
    A1: { normal: 0, youngSwimmer: 0, precompLifesaving: 0 },
    A2: { normal: 0, youngSwimmer: 0, precompLifesaving: 0 },
    A3: { normal: 0, youngSwimmer: 0, precompLifesaving: 0 },
    PA: { normal: 0, youngSwimmer: 0, precompLifesaving: 0 },
    T0: { normal: 3, youngSwimmer: 5, precompLifesaving: 0 },
    T1: { normal: 4, youngSwimmer: 6, precompLifesaving: 0 },
    T2: { normal: 5, youngSwimmer: 8, precompLifesaving: 0 },
    T3: { normal: 6, youngSwimmer: 10, precompLifesaving: 0 },
    T4: { normal: 8, youngSwimmer: 13, precompLifesaving: 0 },
    I1: { normal: 10, youngSwimmer: 16, precompLifesaving: 0 },
    I2: { normal: 13, youngSwimmer: 20, precompLifesaving: 17 },
    I3: { normal: 17, youngSwimmer: 27, precompLifesaving: 21 },
  },
};
