/**
 * Which allowance tiers are eligible to link a teaching allowance into the KPI
 * leaderboard.
 *
 * Some tiers never teach a class, so their allowance must never be linked to a
 * KPI coach:
 *   - A1–A3, PA: admin / front-desk tiers — attendance allowance only.
 *   - T0: a coach who hasn't passed assessment yet, so has no class.
 * The remaining tiers (T1–T4, I1–I3) do teach and are linkable.
 *
 * This is the single source of truth for the rule; the link UI uses it to block
 * linking (and to decide when a previously-set "not applicable" should be
 * re-surfaced because the person moved up to a teaching tier).
 */

import type { AllowanceTier } from "./types";

/** Tiers that structurally cannot hold a class, so are never KPI-linkable. */
export const NON_TEACHING_TIERS: readonly AllowanceTier[] = ["A1", "A2", "A3", "PA", "T0"];

/** Whether a tier is allowed to link its teaching allowance to a KPI coach. */
export function isLinkableTier(tier: AllowanceTier | null | undefined): boolean {
  if (!tier) return true; // unknown tier → don't block; treat as linkable
  return !NON_TEACHING_TIERS.includes(tier);
}

/** Human-readable reason a tier can't be linked, for the blocking error message. */
export function nonLinkableReason(tier: AllowanceTier): string {
  if (tier === "T0") {
    return "T0 hasn't passed assessment yet, so has no class to link.";
  }
  return `${tier} is an admin tier (attendance only) and has no teaching class to link.`;
}
