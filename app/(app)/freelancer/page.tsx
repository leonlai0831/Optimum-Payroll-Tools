import { redirect } from "next/navigation";
import {
  getAllowanceConfig,
  getFreelancerConfig,
  getFreelancerRun,
  listCoaches,
} from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { rosterCoachesFor } from "@/lib/staff/roster";
import { SectionNav } from "@/components/section-nav";
import {
  FreelancerCalculator,
  type FreelancerEditTarget,
  type FreelancerRosterCoach,
} from "@/components/freelancer-calculator";

export const dynamic = "force-dynamic";

export default async function FreelancerPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const caps = await getCapabilities(user);
  if (!caps.has("run_freelancer")) redirect("/");

  const sp = await searchParams;
  const edit = typeof sp.edit === "string" ? sp.edit : undefined;
  const [config, allowanceCfg, coaches, editRun] = await Promise.all([
    getFreelancerConfig(),
    getAllowanceConfig(), // the canonical operating-center list lives here
    listCoaches(),
    edit ? getFreelancerRun(Number(edit)) : Promise.resolve(undefined),
  ]);

  // Pay modules are exclusive by employment type: only freelancers are
  // searchable here (full-timers are paid via Allowance / KPI instead).
  const roster: FreelancerRosterCoach[] = rosterCoachesFor("freelancer", coaches).map((c) => ({
    id: c.id,
    canonicalName: c.canonicalName,
    allowanceTier: c.allowanceTier,
    icNo: c.icNo ?? "",
    bankName: c.bankName ?? "",
    bankAccount: c.bankAccount ?? "",
  }));

  // ?edit=<runId> loads a saved record back into the calculator. Re-saving the
  // same freelancer + period replaces that record (upsertFreelancerRun is idempotent).
  const initial: FreelancerEditTarget | undefined = editRun
    ? { runId: editRun.id, periodLabel: editRun.periodLabel, input: editRun.input }
    : undefined;

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="freelancer" />
      <FreelancerCalculator
        key={initial?.runId ?? "new"}
        config={config}
        centers={allowanceCfg.centers}
        coaches={roster}
        initial={initial}
      />
    </div>
  );
}
