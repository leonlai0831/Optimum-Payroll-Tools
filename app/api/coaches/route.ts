import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createCoach, listCoaches, recordAudit } from "@/lib/db/queries";
import { rosterCoachesFor } from "@/lib/staff/roster";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/performance/types";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Returns the full workforce roster with pay-related fields — same data the
  // directory page gates behind `swim_view_staff`. (The KPI dashboard, gated on
  // `run_kpi`, also calls this; both admin + supervisor hold swim_view_staff.)
  const denied = await requireCapability("swim_view_staff");
  if (denied) return denied;
  const coaches = await listCoaches();
  // ?roster=kpi → the KPI dashboard's merge/carry-over view: full-timers only
  // (freelancers are paid via Freelancer Payment and never appear in uploads).
  const roster = new URL(req.url).searchParams.get("roster");
  return NextResponse.json(roster === "kpi" ? rosterCoachesFor("kpi", coaches) : coaches);
}

export async function POST(req: Request) {
  const denied = await requireCapability("swim_edit_staff");
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    canonicalName?: string;
    employmentType?: string;
    center?: string;
    allowanceTier?: string | null;
  };
  const name = body.canonicalName?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const employmentType = (EMPLOYMENT_TYPES as readonly string[]).includes(body.employmentType ?? "")
    ? (body.employmentType as EmploymentType)
    : "full_time";
  const allowanceTier =
    typeof body.allowanceTier === "string" &&
    (ALLOWANCE_TIERS as readonly string[]).includes(body.allowanceTier)
      ? (body.allowanceTier as AllowanceTier)
      : null;

  // Role is not set by hand — it's derived from the pay tier (A1/A2/A3 → front
  // desk, else instructor). `createCoach` applies the rule when no jobRole is given.
  const coach = await createCoach({
    canonicalName: name,
    employmentType,
    center: body.center,
    allowanceTier,
  });
  const actor = await getCurrentUser();
  if (actor) {
    await recordAudit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "coach.create",
      entity: "coach",
      entityId: coach.id,
      summary: `Created employee "${name}" (${coach.jobRole})`,
    });
  }
  return NextResponse.json({ ok: true, id: coach.id });
}
