import { NextResponse } from "next/server";
import { idleRemainingMs, isSessionIdleExpired } from "@/lib/auth/idle";
import { getSession } from "@/lib/auth/session";

/**
 * Idle-session heartbeat (see lib/auth/idle.ts).
 *
 * POST — refresh `lastSeenAt`: called by the idle-logout component at most
 * once per ping interval while the user is actually active. 401 when the
 * session is missing or already past the authoritative window.
 *
 * GET — freshness probe WITHOUT refreshing: an idle tab asks before logging
 * out, so activity in a sibling tab (which shares the cookie) postpones it.
 *
 * No DB round-trip on purpose: this runs every minute per active client, and
 * a deactivated account is still rejected by every authoritative
 * `getCurrentUser()` check regardless of what the heartbeat does.
 */

export async function POST() {
  const session = await getSession();
  if (!session.userId || isSessionIdleExpired(session.lastSeenAt, Date.now())) {
    session.destroy();
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  session.lastSeenAt = Date.now();
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  if (!session.userId || isSessionIdleExpired(session.lastSeenAt, Date.now())) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, remainingMs: idleRemainingMs(session.lastSeenAt, Date.now()) });
}
