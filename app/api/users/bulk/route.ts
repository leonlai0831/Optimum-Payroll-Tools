import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createUser, listUsers, updateUser, recordAudit } from "@/lib/db/queries";
import { ROLES, canManageUserRole, type Role } from "@/lib/auth/types";
import { planBulkUsers, type BulkMode } from "@/lib/users/bulk-plan";

export const dynamic = "force-dynamic";

/**
 * Create many accounts at once — all with the same role + shared initial
 * password (they reset on first login); the file's name maps to the Full Name.
 *
 * Existing emails are handled by `mode` (the operator is prompted in the UI when
 * the upload overlaps existing accounts):
 *  - `"skip"` (default): existing emails are left untouched and reported.
 *  - `"overwrite"`: existing accounts are updated to the chosen role + shared
 *    password (+ full name when the row has one) — never the actor's own
 *    account and only for accounts the actor outranks (hierarchy scope).
 *
 * Idempotent + partial-safe: re-running with "skip" no-ops the existing rows.
 * manage_users + the chosen role must be below the actor's own.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("manage_users");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    users?: { email?: string; name?: string }[];
    role?: string;
    password?: string;
    mode?: string;
  };
  if (!(ROLES as readonly string[]).includes(body.role ?? "")) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const role = body.role as Role;
  if (!canManageUserRole(actor.role, role)) {
    return NextResponse.json(
      { error: "You can only create accounts with a role below your own." },
      { status: 403 },
    );
  }
  const mode: BulkMode = body.mode === "overwrite" ? "overwrite" : "skip";
  const password = body.password ?? "";
  if (password.length < 6) {
    return NextResponse.json({ error: "Set a shared initial password (≥ 6 chars)." }, { status: 400 });
  }
  const rows = Array.isArray(body.users) ? body.users : [];
  if (rows.length === 0) return NextResponse.json({ error: "No users to add." }, { status: 400 });
  if (rows.length > 200) return NextResponse.json({ error: "Too many at once (max 200)." }, { status: 400 });

  // Full (legal) name is admin-only — the same rule the single-edit PATCH route
  // enforces (it 403s a non-admin fullName change). A non-admin manage_users
  // holder still creates accounts; their uploaded names are just ignored.
  const canSetFullName = actor.role === "admin" || actor.role === "super_admin";

  // Authoritative existence + hierarchy check from the live list (covers accounts
  // the operator's filtered table can't see), then apply the pure plan.
  const existing = (await listUsers()).map((u) => ({ id: u.id, email: u.email, role: u.role }));
  const plan = planBulkUsers({ rows, existing, actorId: actor.id, actorRole: actor.role, mode });

  const created: string[] = [];
  const updated: string[] = [];
  const skipped = [...plan.skipped];

  for (const r of plan.toCreate) {
    try {
      // The uploaded name is the person's full/legal name → Full Name field.
      await createUser({ email: r.email, password, role, fullName: canSetFullName ? r.name : undefined });
      created.push(r.email);
    } catch (e) {
      skipped.push({ email: r.email, reason: e instanceof Error ? e.message : "failed" });
    }
  }
  for (const r of plan.toUpdate) {
    try {
      // Overwrite resets the role + password; full name only when an admin uploaded
      // one (don't wipe a stored legal name with a blank cell, and respect the
      // admin-only rule for the legal name).
      await updateUser(r.id, { role, password, ...(canSetFullName && r.name ? { fullName: r.name } : {}) });
      updated.push(r.email);
    } catch (e) {
      skipped.push({ email: r.email, reason: e instanceof Error ? e.message : "failed" });
    }
  }

  if (created.length > 0) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "user.bulk_create",
      entity: "user",
      entityId: null,
      summary: `Bulk-created ${created.length} ${role} account${created.length === 1 ? "" : "s"}`,
    });
  }
  if (updated.length > 0) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "user.bulk_update",
      entity: "user",
      entityId: null,
      summary: `Bulk-overwrote ${updated.length} existing account${updated.length === 1 ? "" : "s"} → ${role}`,
    });
  }
  return NextResponse.json({ ok: true, created: created.length, updated: updated.length, skipped });
}
