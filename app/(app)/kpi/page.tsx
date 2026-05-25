import { SectionNav } from "@/components/section-nav";
import { Dashboard } from "@/components/dashboard";

export default function KpiDashboardPage() {
  return (
    <div className="fade-in space-y-4">
      <SectionNav section="kpi" />
      <Dashboard />
    </div>
  );
}
