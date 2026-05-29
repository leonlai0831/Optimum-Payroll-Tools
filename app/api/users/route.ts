import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createUser, listUsers } from "@/lib/db/queries";
import { ROLES, type Role } from "@/lib/auth/types";
import type { UserRecord } from "@/lib/db/schema";

/** Never expose the password hash to the client. */
function safeUser(u: UserRecord) {
  return { id: u.id, email: u.email, role: u.role, coachId: u.coachId, active: u.active };
}

export async function GET() {
  const denied = await requireCapability("manage_users");
  if (denied) return denied;
  return NextResponse.json((await listUsers()).map(safeUser));
}

export async function POST(req: Request) {
  const denied = await requireCapability("manage_users");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    role?: string;
    coachId?: number | null;
  };
  const email = body.email?.trim();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (!(ROLES as readonly string[]).includes(body.role ?? "")) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const role = body.role as Role;
  // Only a super_admin may mint another super_admin.
  if (role === "super_admin" && actor.role !== "super_admin") {
    return NextResponse.json({ error: "Only a super admin can create a super admin." }, { status: 403 });
  }

  try {
    const created = await createUser({
      email,
      password,
      role,
      coachId: body.coachId == null ? null : Number(body.coachId),
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
