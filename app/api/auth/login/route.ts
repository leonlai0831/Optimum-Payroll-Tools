import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { countUsers, ensureSuperAdmin, getUserByEmail } from "@/lib/db/queries";
import { verifyPassword } from "@/lib/auth/password";

// Best-effort, in-process login throttle keyed by (IP + email): after too many
// failed attempts inside the window we return 429. This is per-instance only —
// a multi-instance deploy would want a shared store (Redis/DB) instead.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();

/** First IP in X-Forwarded-For (Vercel sets it), else a stable fallback. */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now > rec.resetAt) return false;
  return rec.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || now > rec.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    rec.count += 1;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = body.email?.trim();
  const password = body.password ?? "";

  // Seed the first super_admin on a fresh database so it can be logged into.
  await ensureSuperAdmin();

  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required." },
      { status: 400 },
    );
  }

  const rateKey = `${clientIp(req)}|${email.toLowerCase()}`;
  if (isRateLimited(rateKey)) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  if ((await countUsers()) === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No accounts exist yet. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD, then sign in.",
      },
      { status: 500 },
    );
  }

  const user = await getUserByEmail(email);
  if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
    recordFailure(rateKey);
    // Generic message — don't reveal whether the account exists.
    return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
  }

  attempts.delete(rateKey); // clear the throttle on a successful login
  const session = await getSession();
  // Session fixation: never carry a pre-login session forward — drop any existing
  // session data so a successful login always issues a fresh cookie.
  session.destroy();
  session.userId = user.id;
  session.role = user.role;
  await session.save();
  return NextResponse.json({ ok: true });
}
