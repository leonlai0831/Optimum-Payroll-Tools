import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { resolveEmployeeLink } from "@/lib/auth/user-link";
import { deleteUser, getUserById, listUsers, recordAudit, updateUser } from "@/lib/db/queries";
import {
  ROLES,
  canManageUserRole,
  canViewUserRole,
  sanitizeToolCategories,
  type Role,
} from "@/lib/auth/types";

/**
 * Hierarchy scope shared by PATCH and DELETE: accounts ranked above the actor
 * are invisible (404, not 403, so their existence doesn't leak), and accounts
 * of the actor's own rank are view-only (super_admin excepted — see
 * `canManageUserRole`).
 */
function hierarchyDenied(actorRole: Role, targetRole: Role): NextResponse | null {
  if (!canViewUserRole(actorRole, targetRole)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!canManageUserRole(actorRole, targetRole)) {
    return NextResponse.json(
      { error: "Accounts at your own role level are view-only." },
      { status: 403 },
    );
  }
  return null;
}

async function otherActiveSuperAdmins(exceptId: number) {
  return (await listUsers()).filter(
    (u) => u.role === "super_admin" && u.active && u.id !== exceptId,
  );
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/users/[id]">) {
  const denied = await requireCapability("manage_users");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const userId = Number(id);
  const target = await getUserById(userId);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  const scopeDenied = hierarchyDenied(actor.role, target.role);
  if (scopeDenied) return scopeDenied;

  const body = (await req.json().catch(() => ({}))) as {
    role?: string;
    active?: boolean;
    displayName?: string;
    fullName?: string;
    coachId?: number | null;
    gymStaffId?: number | null;
    visibleCategories?: unknown;
    password?: string;
  };

  const patch: Parameters<typeof updateUser>[1] = {};
  if (typeof body.displayName === "string") patch.displayName = body.displayName;
  // Full (legal) name is admin-only — the nickname (displayName) stays editable
  // by any manage_users holder.
  if (typeof body.fullName === "string") {
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      return NextResponse.json({ error: "Only an admin can edit the full name." }, { status: 403 });
    }
    patch.fullName = body.fullName;
  }
  if (body.role !== undefined) {
    if (!(ROLES as readonly string[]).includes(body.role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }
    // Hierarchy scope: you may only assign roles ranked strictly below your
    // own (super_admin may assign anything, incl. super_admin itself).
    if (!canManageUserRole(actor.role, body.role as Role)) {
      return NextResponse.json(
        { error: "You can only assign roles below your own." },
        { status: 403 },
      );
    }
    patch.role = body.role as Role;
  }
  if (typeof body.active === "boolean") patch.active = body.active;
  // Only touch the employee link when the request actually carries it; setting one
  // side (or both to null) clears the other, keeping coach/gym links exclusive.
  if (body.coachId !== undefined || body.gymStaffId !== undefined) {
    const link = resolveEmployeeLink(body);
    if ("error" in link) return link.error;
    patch.coachId = link.coachId;
    patch.gymStaffId = link.gymStaffId;
  }
  if (body.visibleCategories !== undefined) {
    // Category visibility lives in System Setting → Permissions (super_admin only).
    if (actor.role !== "super_admin") {
      return NextResponse.json(
        { error: "Only a super admin can change category visibility." },
        { status: 403 },
      );
    }
    // A super_admin target always sees everything; storing a narrower list would
    // be invisible everywhere and silently re-apply on a later demotion.
    if (target.role === "super_admin") {
      return NextResponse.json(
        { error: "Super admins always see every category." },
        { status: 400 },
      );
    }
    if (body.visibleCategories === null) {
      // Reset to inherit the role's default categories.
      patch.visibleCategories = null;
    } else {
      const categories = sanitizeToolCategories(body.visibleCategories);
      if (!categories) {
        return NextResponse.json({ error: "Invalid categories." }, { status: 400 });
      }
      patch.visibleCategories = categories;
    }
  }
  if (typeof body.password === "string" && body.password) patch.password = body.password;

  // Never strand the system without an active super_admin.
  const demoting = patch.role !== undefined && patch.role !== "super_admin";
  const deactivating = patch.active === false;
  if (target.role === "super_admin" && (demoting || deactivating)) {
    if ((await otherActiveSuperAdmins(target.id)).length === 0) {
      return NextResponse.json(
        { error: "Cannot demote or deactivate the last active super admin." },
        { status: 400 },
      );
    }
  }

  await updateUser(userId, patch);
  const changed = [
    patch.displayName !== undefined && "nickname",
    patch.fullName !== undefined && "full name",
    patch.role !== undefined && `role→${patch.role}`,
    patch.active !== undefined && (patch.active ? "activated" : "deactivated"),
    (patch.coachId !== undefined || patch.gymStaffId !== undefined) && "linked employee",
    patch.visibleCategories !== undefined &&
      (patch.visibleCategories === null
        ? "categories→inherit role default"
        : `categories→${patch.visibleCategories.join("+") || "none"}`),
    patch.password !== undefined && "password reset",
  ].filter(Boolean);
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "user.update",
    entity: "user",
    entityId: userId,
    summary: `Updated ${target.email}${changed.length ? `: ${changed.join(", ")}` : ""}`,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/users/[id]">) {
  const denied = await requireCapability("manage_users");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const userId = Number(id);
  const target = await getUserById(userId);
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });

  const scopeDenied = hierarchyDenied(actor.role, target.role);
  if (scopeDenied) return scopeDenied;

  if (target.id === actor.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }
  // Only a super_admin reaches a super_admin target (hierarchy gate above).
  if (target.role === "super_admin") {
    if ((await otherActiveSuperAdmins(target.id)).length === 0) {
      return NextResponse.json(
        { error: "Cannot delete the last active super admin." },
        { status: 400 },
      );
    }
  }

  await deleteUser(userId);
  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "user.delete",
    entity: "user",
    entityId: userId,
    summary: `Deleted user ${target.email}`,
  });
  return NextResponse.json({ ok: true });
}
