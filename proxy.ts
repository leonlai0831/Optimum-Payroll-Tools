import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Next.js 16 renamed `middleware` to `proxy`. This is an OPTIMISTIC gate:
 * it redirects to /login when the session cookie is absent. The authoritative
 * check (cookie validity) happens in the protected (app) layout via iron-session.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths. `/setup` + `/api/health` stay open so a broken deploy can be
  // diagnosed before anyone can sign in. `/api/ingest` is machine-to-machine
  // (bearer-key auth inside the route, no session cookie) — without this
  // exemption the proxy would 307 the external sender to /login.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/ingest")
  ) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has(SESSION_COOKIE);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
