import { cache } from "react";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { isSessionIdleExpired } from "./idle";
import {
  effectiveCategories,
  effectiveManagedCenters,
  type Role,
  type ToolCategory,
} from "./types";

export interface SessionData {
  userId?: number;
  role?: Role;
  /**
   * Last activity timestamp (ms epoch) for the idle auto-logout — written at
   * login and refreshed by `POST /api/auth/touch`; checked against the policy
   * in `lib/auth/idle.ts` by `getCurrentUser()`.
   */
  lastSeenAt?: number;
}

export const SESSION_COOKIE = "kpi_session";

const DEV_FALLBACK_SECRET = "dev-only-insecure-session-secret-change-me-please";

/**
 * Resolve the iron-session password at REQUEST time (never at module load).
 *
 * In production a missing/too-short `SESSION_SECRET` is fatal: the app would
 * otherwise sign cookies with a public built-in string, making every session
 * forgeable (full account takeover). We refuse to serve traffic instead of
 * degrading silently — `/api/health` + `/setup` already warn, but a warning is
 * easy to miss. The check is skipped during `next build`
 * (`phase-production-build`), which evaluates code but never serves a request,
 * so a build without the env var still succeeds. Dev/test fall back to a
 * clearly-insecure constant so the app runs with no setup.
 */
export function resolveSessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    throw new Error(
      "SESSION_SECRET is required in production and must be at least 32 characters. " +
        "Set it (e.g. `openssl rand -base64 32`) before serving traffic.",
    );
  }
  return DEV_FALLBACK_SECRET;
}

export const sessionOptions: SessionOptions = {
  // Resolved lazily per request via this getter so `next build` (which never
  // serves a request) succeeds without SESSION_SECRET, while production runtime
  // fails fast when it's missing. See resolveSessionPassword.
  get password() {
    return resolveSessionPassword();
  },
  cookieName: SESSION_COOKIE,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  },
};

/** Read/write the iron-session for the current request (server components + route handlers). */
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export interface CurrentUser {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  coachId: number | null;
  gymStaffId: number | null;
  /**
   * EFFECTIVE launcher categories this account may see, already resolved by
   * `getCurrentUser()`: per-user override ?? the role's default from the
   * permission matrix (super_admin → all). Consumers (launcher, brand-section
   * layouts via `canSeeCategory`) read this list as-is.
   */
  visibleCategories: ToolCategory[];
  /**
   * EFFECTIVE center scope for approvals (review queues + KPI finalize):
   * null = unrestricted (all centers / super_admin); a non-empty list restricts
   * to those centers. Resolved by `getCurrentUser()` via `effectiveManagedCenters`.
   */
  managedCenters: string[] | null;
  active: boolean;
}

/**
 * Resolve the logged-in user from the session, re-validating against the DB so a
 * deactivated/deleted account can't keep a stale cookie. The queries module is
 * imported dynamically so this file stays free of DB code in the edge `proxy`.
 *
 * Wrapped in React `cache()`: the layout, the page, and helpers like
 * `sectionNavProps` all call this on every navigation, so without memoization a
 * single request decrypts the session + hits the DB several times. `cache()`
 * dedupes within one request only (never across requests/users), so it's safe.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session.userId) return null;
  // Idle auto-logout (authoritative): a stale-but-valid cookie is simply
  // treated as signed out. No destroy() here — this also runs during SSR
  // render, where cookies are read-only; login/logout re-issue the cookie.
  if (isSessionIdleExpired(session.lastSeenAt, Date.now())) return null;
  const { getUserById, getPermissionConfig } = await import("@/lib/db/queries");
  const user = await getUserById(session.userId);
  if (!user || !user.active) return null;
  // Resolve the EFFECTIVE category list here, in one place: user override ??
  // the role's default from the permission matrix (a memoized singleton, so
  // this adds no DB round-trip in the steady state); super_admin → all.
  const visibleCategories = effectiveCategories(
    user.role,
    user.visibleCategories,
    (await getPermissionConfig()).categories,
  );
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    coachId: user.coachId,
    gymStaffId: user.gymStaffId,
    visibleCategories,
    managedCenters: effectiveManagedCenters(user.role, user.managedCenters),
    active: user.active,
  };
});

/** Defense-in-depth auth check for API route handlers. */
export async function isAuthed(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}
