import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { DUPLICATE_EMAIL_MESSAGE, LOOSE_EMAIL_RE, MAX_NAME_LENGTH, isDuplicateEmailError } from "@/lib/auth/email";
import { getUserById, updateUser } from "@/lib/db/queries";

const MIN_PASSWORD_LENGTH = 6;

/** Read the current user's basic account info (any logged-in role). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}

/**
 * Update the current user's own account. Any authenticated role can edit their
 * own **email**, **password**, and **nickname (displayName)** — never their full
 * (legal) name or role (those stay admin-controlled). Email/password changes
 * require the current password (protects against silent takeover from a stolen
 * session cookie); a nickname-only change does not.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    currentPassword?: string;
    newEmail?: string;
    newPassword?: string;
    newDisplayName?: string;
  };

  const full = await getUserById(user.id);
  if (!full) return NextResponse.json({ error: "Account not found." }, { status: 404 });

  const patch: { email?: string; password?: string; displayName?: string } = {};

  // Nickname (displayName): low-risk, so no current-password gate. May be blanked
  // (it falls back to the email when empty). Length-capped since this path has no
  // re-auth friction.
  if (body.newDisplayName !== undefined) {
    const displayName = body.newDisplayName.trim();
    if (displayName.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        { error: `Nickname must be ${MAX_NAME_LENGTH} characters or fewer.` },
        { status: 400 },
      );
    }
    if (displayName !== full.displayName) patch.displayName = displayName;
  }

  // Figure out the security-sensitive changes up front.
  const nextEmail = body.newEmail?.trim().toLowerCase();
  const wantsEmail = !!nextEmail && nextEmail !== full.email;
  const wantsPassword = !!body.newPassword;

  // Email/password changes require re-entering the current password.
  if (wantsEmail || wantsPassword) {
    if (!body.currentPassword) {
      return NextResponse.json(
        { error: "Current password is required to change your email or password." },
        { status: 400 },
      );
    }
    if (!verifyPassword(body.currentPassword, full.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }
  }

  if (wantsEmail) {
    if (!LOOSE_EMAIL_RE.test(nextEmail!)) {
      return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
    }
    patch.email = nextEmail;
  }

  if (wantsPassword) {
    if (body.newPassword!.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 },
      );
    }
    patch.password = body.newPassword;
  }

  if (patch.email === undefined && patch.password === undefined && patch.displayName === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    await updateUser(user.id, patch);
  } catch (e) {
    // Email clash is user-facing; rethrow anything else so it 500s + is logged
    // (instead of a misleading 400 that leaks the raw driver message).
    if (isDuplicateEmailError(e)) {
      return NextResponse.json({ error: DUPLICATE_EMAIL_MESSAGE }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
