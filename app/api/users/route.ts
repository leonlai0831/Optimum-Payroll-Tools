import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { resolveEmployeeLink } from "@/lib/auth/user-link";
import { createUser, listUsers, recordAudit } from "@/lib/db/queries";
import { ROLES, sanitizeToolCategories, type Role, type ToolCategory } from "@/lib/auth/types";
import type { UserRecord } from "@/lib/db/schema";

/** Never expose the password hash to the client. */
function safeUser(u: UserRecord) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    coachId: u.coachId,
    gymStaffId: u.gymStaffId,
    active: u.active,
  };
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
    displayName?: string;
    coachId?: number | null;
    gymStaffId?: number | null;
    visibleCategories?: unknown;
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
  const link = resolveEmployeeLink(body);
  if ("error" in link) return link.error;

  // Optional creation-time category override. Omitted (or explicit null) →
  // stored NULL → the account inherits its role's default categories.
  // Same rules as PATCH: super_admin only, and never stored on a super_admin.
  let visibleCategories: ToolCategory[] | undefined;
  if (body.visibleCategories !== undefined && body.visibleCategories !== null) {
    if (actor.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only a super admin can set category visibility." },
        { status: 403 },
      );
    }
    if (role === "super_admin") {
      return NextResponse.json(
        { error: "Super admins always see every category." },
        { status: 400 },
      );
    }
    const categories = sanitizeToolCategories(body.visibleCategories);
    if (!categories) {
      return NextResponse.json({ error: "Invalid categories." }, { status: 400 });
    }
    visibleCategories = categories;
  }

  try {
    const created = await createUser({
      email,
      password,
      role,
      displayName: body.displayName,
      coachId: link.coachId,
      gymStaffId: link.gymStaffId,
      visibleCategories,
    });
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "user.create",
      entity: "user",
      entityId: created.id,
      summary: `Created user ${created.email} (${role})`,
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not create user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
