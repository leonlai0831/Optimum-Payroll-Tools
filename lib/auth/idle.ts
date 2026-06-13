/**
 * Idle-session policy: a signed-in user with no activity for IDLE_TIMEOUT_MS
 * is automatically signed out (shared front-desk devices must not stay
 * unlocked). Enforcement is two-layered:
 *
 * - Client (`components/idle-logout.tsx`): tracks real activity, pings
 *   `POST /api/auth/touch` at most once per IDLE_PING_INTERVAL_MS to refresh
 *   the session's `lastSeenAt`, and performs the visible logout at exactly
 *   IDLE_TIMEOUT_MS of local inactivity (after asking the server, so an
 *   active sibling tab keeps the session alive).
 * - Server (authoritative, `isSessionIdleExpired` in `getCurrentUser()` and
 *   the touch route): rejects a session whose `lastSeenAt` is older than
 *   IDLE_TIMEOUT_MS + IDLE_SERVER_GRACE_MS, so a closed tab can't keep a
 *   cookie usable. The grace covers the ping throttle: the last real action
 *   can be up to one ping interval newer than `lastSeenAt`.
 *
 * Pure module — no Next/DB imports — so the client bundle and unit tests can
 * share it.
 */

export const IDLE_TIMEOUT_MS = 10 * 60_000;
export const IDLE_PING_INTERVAL_MS = 60_000;
export const IDLE_SERVER_GRACE_MS = 90_000;

/**
 * True when the session is past the authoritative idle window. A session
 * without `lastSeenAt` (issued before this feature deployed, or tampered to
 * a non-number) is treated as expired — one forced re-login, then the field
 * exists.
 */
export function isSessionIdleExpired(lastSeenAt: number | undefined, now: number): boolean {
  if (typeof lastSeenAt !== "number" || !Number.isFinite(lastSeenAt)) return true;
  return now - lastSeenAt > IDLE_TIMEOUT_MS + IDLE_SERVER_GRACE_MS;
}

/**
 * Milliseconds until the CLIENT-policy idle deadline (lastSeenAt +
 * IDLE_TIMEOUT_MS), floored at 0. The idle-logout component uses this to let
 * an active sibling tab postpone another tab's logout.
 */
export function idleRemainingMs(lastSeenAt: number | undefined, now: number): number {
  if (typeof lastSeenAt !== "number" || !Number.isFinite(lastSeenAt)) return 0;
  return Math.max(0, lastSeenAt + IDLE_TIMEOUT_MS - now);
}
