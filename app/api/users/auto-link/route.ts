import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { userCan } from "@/lib/auth/permissions";
import { canManageUserRole } from "@/lib/auth/types";
import { listCoaches, listUsers, recordAudit, updateUser } from "@/lib/db/queries";
import { deterministicLinks, sharesNameSignal, type LinkUser } from "@/lib/users/autolink";
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

  // One workforce profile ↔ one login: a coach already linked to ANY account is
  // off the table, so auto-link can never point a second user at the same coach.
  const linkedCoachIds = new Set(
    users.map((u) => u.coachId).filter((id): id is number => id != null),
  );
  const coachOpts = coaches
    .filter((c) => !linkedCoachIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.canonicalName }));
  const coachName = new Map(coaches.map((c) => [c.id, c.canonicalName]));

  const linkUsers: LinkUser[] = unlinked.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    fullName: u.fullName,
    email: u.email,
  }));
  const linkUserById = new Map(linkUsers.map((u) => [u.id, u]));

  // 1. Deterministic, precision-first match (full name + nickname, token-aware,
  //    unique-only). Works with no API key.
  const det = deterministicLinks(linkUsers, coachOpts);
  const linkedUserIds = new Set(det.map((l) => l.userId));
  const usedCoachIds = new Set(det.map((l) => l.coachId));

  // 2. AI pass on what's left (degrades to [] without ANTHROPIC_API_KEY), then a
  //    safety gate: drop any AI match that shares no real name token with the
  //    account (kills hallucinated links for signal-less accounts).
  const aiRaw = await matchUsersToCoaches(
    linkUsers
      .filter((u) => !linkedUserIds.has(u.id))
      .map((u) => ({ id: u.id, name: u.displayName, fullName: u.fullName, email: u.email })),
    coachOpts.filter((c) => !usedCoachIds.has(c.id)),
  );
  const ai = aiRaw.filter((m) => {
    const u = linkUserById.get(m.userId);
    const cn = coachName.get(m.coachId);
    return u != null && cn != null && sharesNameSignal(u, cn);
  });

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
