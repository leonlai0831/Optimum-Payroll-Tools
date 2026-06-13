/**
 * Pure decision layer for the "Bulk add users" upload: given the parsed rows and
 * the accounts that already exist, decide per row whether to CREATE a new
 * account, OVERWRITE an existing one, or SKIP it. Kept DB-free so the rules are
 * unit-locked — this is auth-sensitive (an overwrite resets the account's role +
 * password), so the hierarchy guards must be tested, not trusted.
 *
 * The route (`POST /api/users/bulk`) reads the live user list, runs this planner,
 * then applies the plan (createUser / updateUser). The UI prompts the operator to
 * pick the mode whenever the upload overlaps existing emails.
 */
import { canManageUserRole, type Role } from "@/lib/auth/types";

/** What to do with uploaded emails that already exist in the system. */
export type BulkMode = "skip" | "overwrite";

/** An existing account, used only for conflict detection + hierarchy checks. */
export type ExistingAccount = { id: number; email: string; role: Role };

export type BulkCreate = { email: string; name: string };
export type BulkUpdate = { id: number; email: string; name: string };

export type BulkPlan = {
  toCreate: BulkCreate[];
  toUpdate: BulkUpdate[];
  skipped: { email: string; reason: string }[];
};

const norm = (email: string) => email.trim().toLowerCase();

export function planBulkUsers(opts: {
  rows: { email?: string; name?: string }[];
  existing: ExistingAccount[];
  actorId: number;
  actorRole: Role;
  mode: BulkMode;
}): BulkPlan {
  const byEmail = new Map<string, ExistingAccount>();
  for (const e of opts.existing) byEmail.set(norm(e.email), e);

  const toCreate: BulkCreate[] = [];
  const toUpdate: BulkUpdate[] = [];
  const skipped: { email: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const r of opts.rows) {
    const email = (r.email ?? "").trim();
    if (!email) continue;
    const key = norm(email);
    if (seen.has(key)) {
      skipped.push({ email, reason: "duplicate in list" });
      continue;
    }
    seen.add(key);
    const name = (r.name ?? "").trim();

    const hit = byEmail.get(key);
    if (!hit) {
      toCreate.push({ email, name });
      continue;
    }
    // The email already exists.
    if (opts.mode === "skip") {
      skipped.push({ email, reason: "already exists" });
      continue;
    }
    // Overwrite — but never the actor's own account, and only when the actor
    // outranks the existing account (same hierarchy rule the inline editor uses).
    if (hit.id === opts.actorId) {
      skipped.push({ email, reason: "your own account" });
      continue;
    }
    if (!canManageUserRole(opts.actorRole, hit.role)) {
      // Don't reveal that the email maps to a HIGHER-ranked account (the users
      // API 404s such accounts so their existence doesn't leak) — report the
      // same neutral "already exists" an in-scope existing email gets.
      skipped.push({ email, reason: "already exists" });
      continue;
    }
    toUpdate.push({ id: hit.id, email, name });
  }
  return { toCreate, toUpdate, skipped };
}
