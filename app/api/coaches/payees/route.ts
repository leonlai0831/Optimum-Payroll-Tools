import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { bulkUpdatePayeeDetails, recordAudit } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

/**
 * Bulk payee-details save for the Workforce → Payees tab: IC / bank / account
 * for FREELANCERS (the rows the monthly bank-transfer file needs). Same field
 * semantics as the single-profile PATCH — trimmed, empty string clears.
 */
export async function PUT(req: Request) {
  const denied = await requireCapability("swim_edit_staff");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    rows?: { id?: number; icNo?: string; bankName?: string; bankAccount?: string }[];
  };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "No rows to save." }, { status: 400 });
  }
  if (body.rows.length > 500) {
    return NextResponse.json({ error: "Too many rows." }, { status: 400 });
  }

  // One transaction for the whole batch (atomic; no per-row round-trip pairs).
  const savedNames = await bulkUpdatePayeeDetails(
    body.rows
      .map((row) => ({ ...row, id: Number(row.id) }))
      .filter((row) => Number.isInteger(row.id)),
  );

  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "coach.payees_bulk",
    entity: "coach",
    summary: `Bulk payee details: ${savedNames.length} freelancer(s) updated${
      savedNames.length ? ` (${savedNames.slice(0, 5).join(", ")}${savedNames.length > 5 ? ", …" : ""})` : ""
    }`,
  });
  return NextResponse.json({ ok: true, saved: savedNames.length });
}
