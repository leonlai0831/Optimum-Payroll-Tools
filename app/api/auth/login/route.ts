import { NextResponse } from "next/server";
import { expectedPassword, getSession } from "@/lib/auth/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  const expected = expectedPassword();

  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Login is not configured (APP_PASSWORD missing)." },
      { status: 500 },
    );
  }
  if (body.password !== expected) {
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const session = await getSession();
  session.authenticated = true;
  await session.save();
  return NextResponse.json({ ok: true });
}
