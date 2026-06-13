import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { clearAppErrors, recordAppError, recordAudit } from "@/lib/db/queries";

/**
 * Client-side error reports (see components/error-reporter.tsx) land here.
 * The proxy exempts this path so the LOGIN page can report too (no session
 * cookie yet) — so POST must defend itself: in-process per-IP rate limit,
 * hard size caps (enforced again in recordAppError), and a body it can't
 * trust beyond "strings". When a session exists, the reporter is attributed.
 */
const MAX_REPORTS = 30;
const WINDOW_MS = 10 * 60 * 1000;
const reports = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const rec = reports.get(key);
  if (!rec || now > rec.resetAt) {
    reports.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_REPORTS;
}

export async function POST(req: Request) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: unknown;
    stack?: unknown;
    path?: unknown;
  };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "message is required" }, { status: 400 });
  }

  // Attribution is best-effort: reports from the login page have no session.
  const user = await getCurrentUser().catch(() => null);

  await recordAppError({
    source: "client",
    message,
    stack: typeof body.stack === "string" ? body.stack : null,
    path: typeof body.path === "string" ? body.path : null,
    userId: user?.id ?? null,
    userEmail: user?.email ?? "",
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}

/** "Clear all" on /system/errors. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== "super_admin") return NextResponse.json({ ok: false }, { status: 403 });

  await clearAppErrors();
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "app_errors.cleared",
    entity: "app_errors",
    summary: "Cleared the captured-error list",
  });
  return NextResponse.json({ ok: true });
}
