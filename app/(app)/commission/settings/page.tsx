import { SlidersHorizontal } from "lucide-react";
import { SectionPlaceholder } from "@/components/section-placeholder";

export default function CommissionSettingsPage() {
  return (
    <SectionPlaceholder
      icon={SlidersHorizontal}
      title="Commission rules"
      description="Configure the commission model — membership-sales rates, personal-training session rates, product-sales percentages, and any tiers or caps."
    />
  );
}
