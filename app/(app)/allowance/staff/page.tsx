import { getAllowanceConfig, listCoaches } from "@/lib/db/queries";
import { SectionNav } from "@/components/section-nav";
import { StaffListManager, type StaffMember } from "@/components/staff-list-manager";

export const dynamic = "force-dynamic";

export default async function StaffListPage() {
  const [coaches, config] = await Promise.all([listCoaches(), getAllowanceConfig()]);
  const staff: StaffMember[] = coaches.map((c) => ({
    id: c.id,
    name: c.canonicalName,
    center: c.center,
    position: c.allowanceTier,
    active: c.active,
  }));
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="allowance" />
      <StaffListManager staff={staff} centers={config.centers} />
    </div>
  );
}
