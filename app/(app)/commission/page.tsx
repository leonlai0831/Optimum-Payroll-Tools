import { Calculator } from "lucide-react";
import { SectionPlaceholder } from "@/components/section-placeholder";

export default function CommissionCalculatorPage() {
  return (
    <SectionPlaceholder
      icon={Calculator}
      title="Commission Calculator"
      description="Enter each gym staff member's membership sales, personal-training sessions, and product sales for the month to calculate their commission."
    />
  );
}
