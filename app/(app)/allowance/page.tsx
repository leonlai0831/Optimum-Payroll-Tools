import { redirect } from "next/navigation";
import {
  getAllowanceConfig,
  getAllowanceRun,
  isPeriodLocked,
  listAllowancePeriods,
  listCoaches,
} from "@/lib/db/queries";
import { rosterCoachesFor } from "@/lib/staff/roster";
import { SectionNav } from "@/components/section-nav";
import { AllowanceCalculator, type AllowanceEditTarget } from "@/components/allowance-calculator";

export const dynamic = "force-dynamic";

export default async function AllowancePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const edit = typeof sp.edit === "string" ? sp.edit : undefined;
  const [config, coaches, existingPeriods, editRun] = await Promise.all([
    getAllowanceConfig(),
    listCoaches(),
    listAllowancePeriods(),
    edit ? getAllowanceRun(Number(edit)) : Promise.resolve(undefined),
  ]);
  // Full-time roster only — freelancers are paid via Freelancer Payment.
  const roster = rosterCoachesFor("allowance", coaches).map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      center: c.center,
      allowanceTier: c.allowanceTier,
  }));

  // ?edit=<runId> loads a saved record back into the calculator. Re-saving the
  // same staff + period replaces that record (createAllowanceRun is idempotent),
  // so a second center's manager can add their hours without clobbering the first.
  let initial: AllowanceEditTarget | undefined;
  if (editRun) {
    // A locked month can't be edited — send back to history rather than open a
    // form whose save the server would reject.
    if (await isPeriodLocked(editRun.periodLabel)) redirect("/allowance/history");
    initial = { runId: editRun.id, periodLabel: editRun.periodLabel, input: editRun.input };
  }

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <AllowanceCalculator
        key={initial?.runId ?? "new"}
        config={config}
        coaches={roster}
        initial={initial}
        existingPeriods={existingPeriods}
      />
    </div>
  );
}
