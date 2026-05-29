import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { getUserById, updateUser } from "@/lib/db/queries";

const MIN_PASSWORD_LENGTH = 6;
// Same shape the rest of the app accepts: requires an "@" with no whitespace.
// A stricter TLD-required check would reject the dev-bootstrap `admin@local`.
const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

/** Read the current user's basic account info (any logged-in role). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}

/**
 * Update the current user's own email and/or password. Any authenticated role
 * (super_admin, admin, staff) can call this on their own account. Always
 * requires the current password — protects against silent takeover from a
 * stolen session cookie.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    currentPassword?: string;
    newEmail?: string;
    newPassword?: string;
  };

  if (!body.currentPassword) {
    return NextResponse.json({ error: "Current password is required." }, { status: 400 });
  }

  const full = await getUserById(user.id);
  if (!full) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  if (!verifyPassword(body.currentPassword, full.passwordHash)) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
  }

  const patch: { email?: string; password?: string } = {};

  if (body.newEmail !== undefined) {
    const normalized = body.newEmail.trim().toLowerCase();
    if (normalized && normalized !== full.email) {
      if (!EMAIL_RE.test(normalized)) {
        return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
      }
      patch.email = normalized;
    }
  }

  if (body.newPassword) {
    if (body.newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }
    patch.password = body.newPassword;
  }

  if (!patch.email && !patch.password) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    await updateUser(user.id, patch);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Update failed." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
