import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createUser, recordAudit } from "@/lib/db/queries";
import { ROLES, canManageUserRole, type Role } from "@/lib/auth/types";

export const dynamic = "force-dynamic";

/**
 * Create many accounts at once — all with the same role + shared initial
 * password (they reset on first login); display name optional per row. Existing
 * emails and in-list duplicates are skipped and reported, so a partial paste is
 * safe to re-run. manage_users + the role must be below the actor's own.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("manage_users");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    users?: { email?: string; displayName?: string }[];
    role?: string;
    password?: string;
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
  const password = body.password ?? "";
  if (password.length < 6) {
    return NextResponse.json({ error: "Set a shared initial password (≥ 6 chars)." }, { status: 400 });
  }
  const rows = Array.isArray(body.users) ? body.users : [];
  if (rows.length === 0) return NextResponse.json({ error: "No users to add." }, { status: 400 });
  if (rows.length > 200) return NextResponse.json({ error: "Too many at once (max 200)." }, { status: 400 });

  const created: string[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const email = (r.email ?? "").trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ email, reason: "duplicate in list" });
      continue;
    }
    seen.add(key);
    try {
      await createUser({ email, password, role, displayName: r.displayName });
      created.push(email);
    } catch (e) {
      skipped.push({ email, reason: e instanceof Error ? e.message : "failed" });
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
  return NextResponse.json({ ok: true, created: created.length, skipped });
}
