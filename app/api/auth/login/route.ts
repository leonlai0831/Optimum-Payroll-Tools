import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { countUsers, ensureSuperAdmin, getUserByEmail } from "@/lib/db/queries";
import { verifyPassword } from "@/lib/auth/password";

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
    return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.role = user.role;
  await session.save();
  return NextResponse.json({ ok: true });
}
