import { History } from "lucide-react";
import { SectionPlaceholder } from "@/components/section-placeholder";

export default function CommissionHistoryPage() {
  return (
    <SectionPlaceholder
      icon={History}
      title="History"
      description="Saved monthly commission runs, each reproducible from the rules in effect when it was saved."
    />
  );
}
