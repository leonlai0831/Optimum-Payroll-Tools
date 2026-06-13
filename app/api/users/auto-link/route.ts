import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { canManageUserRole } from "@/lib/auth/types";
import { listCoaches, listUsers, recordAudit, updateUser } from "@/lib/db/queries";
import { deterministicLinks } from "@/lib/users/autolink";
import { matchUsersToCoaches } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";

/**
 * Auto-link unlinked login accounts to their coach profile by name. Two passes:
 * a deterministic unique clean-name match (always on), then a Claude pass on the
 * remainder (no-ops without ANTHROPIC_API_KEY). Only acts on accounts the actor
 * may manage (hierarchy). Links are reversible from the row's picker.
 */
export async function POST() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await userCan(actor, "manage_users"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [users, coaches] = await Promise.all([listUsers(), listCoaches()]);
  const unlinked = users.filter(
    (u) => u.coachId == null && u.gymStaffId == null && canManageUserRole(actor.role, u.role),
  );
  if (unlinked.length === 0 || coaches.length === 0) {
    return NextResponse.json({ ok: true, linked: 0, matches: [] });
  }

  const coachOpts = coaches.map((c) => ({ id: c.id, name: c.canonicalName }));

  // 1. Deterministic unique clean-name matches (works with no API key).
  const det = deterministicLinks(
    unlinked.map((u) => ({ id: u.id, name: u.displayName })),
    coachOpts,
  );
  const linkedUserIds = new Set(det.map((l) => l.userId));
  const usedCoachIds = new Set(det.map((l) => l.coachId));

  // 2. AI pass on what's left (degrades to [] without ANTHROPIC_API_KEY).
  const ai = await matchUsersToCoaches(
    unlinked
      .filter((u) => !linkedUserIds.has(u.id))
      .map((u) => ({ id: u.id, name: u.displayName, email: u.email })),
    coachOpts.filter((c) => !usedCoachIds.has(c.id)),
  );

  const coachName = new Map(coaches.map((c) => [c.id, c.canonicalName]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const matches: { email: string; coachName: string }[] = [];
  for (const { userId, coachId } of [...det, ...ai]) {
    await updateUser(userId, { coachId, gymStaffId: null });
    matches.push({
      email: userById.get(userId)?.email ?? String(userId),
      coachName: coachName.get(coachId) ?? String(coachId),
    });
  }

  if (matches.length > 0) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "user.auto_link",
      entity: "user",
      entityId: null,
      summary: `Auto-linked ${matches.length} account${matches.length === 1 ? "" : "s"} to a coach profile`,
    });
  }
  return NextResponse.json({ ok: true, linked: matches.length, matches });
}
