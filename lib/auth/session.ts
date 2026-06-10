import { cache } from "react";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { effectiveCategories, type Role, type ToolCategory } from "./types";

export interface SessionData {
  userId?: number;
  role?: Role;
}

export const SESSION_COOKIE = "kpi_session";

export const sessionOptions: SessionOptions = {
  // Must be >= 32 chars. Set SESSION_SECRET in production; dev fallback below.
  password:
    process.env.SESSION_SECRET || "dev-only-insecure-session-secret-change-me-please",
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
    active: user.active,
  };
});

/** Defense-in-depth auth check for API route handlers. */
export async function isAuthed(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}
