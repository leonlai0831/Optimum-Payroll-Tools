import { NextResponse } from "next/server";
import { getCurrentUser, isAuthed } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createCoach, listCoaches, recordAudit } from "@/lib/db/queries";
import { EMPLOYMENT_TYPES, type EmploymentType } from "@/lib/performance/types";
import { ALLOWANCE_TIERS, type AllowanceTier } from "@/lib/allowance/types";

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await listCoaches());
}

export async function POST(req: Request) {
  const denied = await requireCapability("edit_staff");
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
