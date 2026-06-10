import type { RunCoach } from "@/lib/types";

/**
 * Accepted |payout − finalScore × teachingAllowance| drift: 1 sen. The client
 * computes payout with the exact same floats, so honest saves are bit-equal;
 * the sen of headroom only forgives serialization-level noise, never a
 * tampered or stale figure.
 */
const PAYOUT_TOLERANCE_RM = 0.01;

/**
 * Validate a POST /api/runs payload before it is persisted. The KPI engine runs
 * client-side, so the server re-checks the money invariant it can verify
 * without re-running the engine: `payout === finalScore × teachingAllowance`
 * (CLAUDE.md's locked v11.1 rule) for every coach whose allowance is set.
 *
 * Returns a human-readable error, or null when the payload is acceptable.
 */
export function validateRunPayload(body: {
  configSnapshot?: unknown;
  coachResults?: unknown;
}): string | null {
  const cfg = body.configSnapshot;
  if (cfg == null || typeof cfg !== "object" || Array.isArray(cfg)) {
    return "configSnapshot is required and must be an object";
  }
  if (!Array.isArray(body.coachResults)) {
    return "coachResults must be an array";
  }
  for (const c of body.coachResults as Partial<RunCoach>[]) {
    if (typeof c?.teachingAllowance !== "number") continue;
    const expected = (c.finalScore as number) * c.teachingAllowance;
    const ok =
      typeof c.payout === "number" &&
      Number.isFinite(expected) &&
      Math.abs(c.payout - expected) <= PAYOUT_TOLERANCE_RM;
    if (!ok) {
      const who = c.canonicalName || "a coach";
      return `payout for ${who} does not equal finalScore × teachingAllowance`;
    }
  }
  return null;
}
