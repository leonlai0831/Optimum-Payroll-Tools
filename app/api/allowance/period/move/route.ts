import { NextResponse } from "next/server";
import { requireManager } from "@/lib/auth/permissions";
import { isValidPeriod } from "@/lib/allowance/period";
import {
  countAllowanceRunsForPeriod,
  isPeriodLocked,
  moveAllowancePeriod,
  recordAudit,
} from "@/lib/db/queries";

/**
 * Relabel a whole month: move every entry from `from` to `to`. Manager-only.
 * If any staff member already has an entry in `to`, the whole move is blocked
 * (409) and the clashing names are returned — nothing is overwritten or partially
 * moved. Both months must be unlocked. Used to fix a batch keyed under the wrong
 * month.
 */
export async function POST(req: Request) {
  const gate = await requireManager();
  if ("error" in gate) return gate.error;

  const body = (await req.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = body.from?.trim();
  const to = body.to?.trim();
  if (!from || !to || !isValidPeriod(from) || !isValidPeriod(to)) {
    return NextResponse.json({ error: "from and to must be valid YYYY-MM months" }, { status: 400 });
  }
  if (from === to) {
    return NextResponse.json({ error: "Pick a different target month." }, { status: 400 });
  }
  if ((await countAllowanceRunsForPeriod(from)) === 0) {
    return NextResponse.json({ error: `${from} has no entries to move.` }, { status: 400 });
  }
  if (await isPeriodLocked(from)) {
    return NextResponse.json({ error: `${from} is locked. Unlock it first.` }, { status: 409 });
  }
  if (await isPeriodLocked(to)) {
    return NextResponse.json({ error: `${to} is locked. Unlock it first.` }, { status: 409 });
  }

  const { moved, clashes } = await moveAllowancePeriod(from, to);
  if (clashes.length > 0) {
    const names = clashes.slice(0, 8).join(", ") + (clashes.length > 8 ? "…" : "");
    return NextResponse.json(
      {
        error: `Move blocked — ${clashes.length} ${clashes.length === 1 ? "person" : "people"} already have an entry in ${to}: ${names}. Resolve those first (or move them individually).`,
        clashes,
      },
      { status: 409 },
    );
  }
  await recordAudit({
    actorId: gate.user.id,
    actorEmail: gate.user.email,
    action: "allowance.period_move",
    entity: "allowance_period",
    entityId: `${from}->${to}`,
    summary: `Moved allowance month ${from} → ${to}: ${moved} entries`,
  });
  return NextResponse.json({ ok: true, moved, clashes: [] });
}
