import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requireCapability } from "@/lib/auth/permissions";
import { createCoach, listCoaches, recordAudit, updateCoach } from "@/lib/db/queries";
import { parsePaymentSummary } from "@/lib/freelancer/import";

export const dynamic = "force-dynamic";

/** ~1 MB cap — a monthly summary is a few tens of KB. */
const MAX_BYTES = 1_000_000;

/**
 * Workforce → Payees → "Import summary file": upload the operator's monthly
 * Payment Summary workbook and every payee becomes/updates a FREELANCER
 * profile (name, position → tier, IC, bank, account). Existing freelancers
 * are updated; names that already exist as NON-freelancers are reported and
 * left untouched. Re-importing the same file is idempotent.
 */
export async function POST(req: Request) {
  const denied = await requireCapability("swim_edit_staff");
  if (denied) return denied;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach the summary .xlsx as 'file'." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large." }, { status: 400 });
  }

  let payees;
  try {
    payees = await parsePaymentSummary(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Could not read the workbook." }, { status: 400 });
  }
  if (payees.length === 0) {
    return NextResponse.json(
      { error: "No payee rows found — is this the monthly Payment Summary?" },
      { status: 400 },
    );
  }

  const existing = new Map((await listCoaches()).map((c) => [c.canonicalName.toUpperCase(), c]));
  let created = 0;
  let updated = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const p of payees) {
    const match = existing.get(p.name);
    const payee = {
      icNo: p.icNo || null,
      bankName: p.bankName || null,
      bankAccount: p.bankAccount || null,
    };
    // "CC" is freelancer-only — not an allowance tier, never stored as one.
    const tier = p.position === "CC" ? null : p.position;
    if (!match) {
      const coach = await createCoach({
        canonicalName: p.name,
        employmentType: "freelancer",
        allowanceTier: tier,
      });
      await updateCoach(coach.id, payee);
      created++;
    } else if (match.employmentType === "freelancer") {
      await updateCoach(match.id, { ...payee, allowanceTier: tier ?? match.allowanceTier });
      updated++;
    } else {
      skipped.push({ name: p.name, reason: `exists as ${match.employmentType}` });
    }
  }

  await recordAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "coach.payees_import",
    entity: "coach",
    summary: `Imported freelancer summary "${file.name}": ${created} created, ${updated} updated, ${skipped.length} skipped`,
  });
  return NextResponse.json({ ok: true, created, updated, skipped, total: payees.length });
}
