import { redirect } from "next/navigation";
import { getAllowanceConfig, getAllowanceRun, isPeriodLocked, listCoaches } from "@/lib/db/queries";
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
  const [config, coaches] = await Promise.all([getAllowanceConfig(), listCoaches()]);
  const roster = coaches
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      center: c.center,
      allowanceTier: c.allowanceTier,
    }));

  // ?edit=<runId> loads a saved record back into the calculator. Re-saving the
  // same staff + period replaces that record (createAllowanceRun is idempotent),
  // so a second center's manager can add their hours without clobbering the first.
  let initial: AllowanceEditTarget | undefined;
  if (edit) {
    const run = await getAllowanceRun(Number(edit));
    // A locked month can't be edited — send back to history rather than open a
    // form whose save the server would reject.
    if (run && (await isPeriodLocked(run.periodLabel))) redirect("/allowance/history");
    if (run) initial = { runId: run.id, periodLabel: run.periodLabel, input: run.input };
  }

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <AllowanceCalculator
        key={initial?.runId ?? "new"}
        config={config}
        coaches={roster}
        initial={initial}
      />
    </div>
  );
}
