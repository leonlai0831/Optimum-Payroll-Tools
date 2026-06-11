import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import {
  getAllowanceSavers,
  listAllowanceLocks,
  listAllowanceRuns,
  listCoaches,
} from "@/lib/db/queries";
import { rosterCoachesFor } from "@/lib/staff/roster";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import { SectionNav } from "@/components/section-nav";
import { AllowanceHistoryView } from "@/components/allowance-history-view";
import { AllowanceCompleteness, type RosterEntry } from "@/components/allowance-completeness";

export const dynamic = "force-dynamic";

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function AllowanceHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Edit attribution ("edited by …") is visible to admins + super admins only.
  const canSeeEditors = user.role === "admin" || user.role === "super_admin";
  // Closing/reopening a month is an admin/super_admin action.
  const canLock = user.role === "admin" || user.role === "super_admin";
  const [rows, caps, savers, coaches, locks] = await Promise.all([
    listAllowanceRuns(),
    getCapabilities(user),
    canSeeEditors ? getAllowanceSavers() : Promise.resolve(null),
    listCoaches(),
    listAllowanceLocks(),
  ]);
  const lockedPeriods = locks.map((l) => l.periodLabel);

  const period = currentPeriod();
  // Full-time roster only — freelancers are paid via Freelancer Payment.
  const roster: RosterEntry[] = rosterCoachesFor("allowance", coaches).map((c) => ({
    id: c.id,
    name: c.canonicalName,
    center: c.center,
  }));
  const savedNames = rows.filter((r) => r.periodLabel === period).map((r) => r.canonicalName);

  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <h1 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Coins className="h-5 w-5 text-indigo-500" /> Saved Allowances
      </h1>
      {roster.length > 0 && (
        <AllowanceCompleteness period={period} roster={roster} savedNames={savedNames} />
      )}
      <AllowanceHistoryView
        rows={rows}
        canEdit={caps.has("run_allowance")}
        savers={savers}
        lockedPeriods={lockedPeriods}
        canLock={canLock}
      />
    </div>
  );
}
