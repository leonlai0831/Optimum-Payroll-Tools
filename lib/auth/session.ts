import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { Role } from "./types";

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
  role: Role;
  coachId: number | null;
  active: boolean;
}

/**
 * Resolve the logged-in user from the session, re-validating against the DB so a
 * deactivated/deleted account can't keep a stale cookie. The queries module is
 * imported dynamically so this file stays free of DB code in the edge `proxy`.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session.userId) return null;
  const { getUserById } = await import("@/lib/db/queries");
  const user = await getUserById(session.userId);
  if (!user || !user.active) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    coachId: user.coachId,
    active: user.active,
  };
}

/** Defense-in-depth auth check for API route handlers. */
export async function isAuthed(): Promise<boolean> {
  return (await getCurrentUser()) !== null;
}
