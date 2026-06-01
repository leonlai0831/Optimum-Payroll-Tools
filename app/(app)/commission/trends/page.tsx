import { BarChart3 } from "lucide-react";
import { SectionPlaceholder } from "@/components/section-placeholder";

export default function CommissionTrendsPage() {
  return (
    <SectionPlaceholder
      icon={BarChart3}
      title="Trends"
      description="Month-over-month commission totals per staff member and per gym, once a few months are saved."
    />
  );
}
