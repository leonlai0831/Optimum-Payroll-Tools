import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  authenticated?: boolean;
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

/** The expected login password (dev fallback when APP_PASSWORD is unset locally). */
export function expectedPassword(): string | undefined {
  return (
    process.env.APP_PASSWORD ||
    (process.env.NODE_ENV !== "production" ? "swim123" : undefined)
  );
}

/** Defense-in-depth auth check for API route handlers. */
export async function isAuthed(): Promise<boolean> {
  const session = await getSession();
  return !!session.authenticated;
}
