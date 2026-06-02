import { Layers } from "lucide-react";
import { SectionPlaceholder } from "@/components/section-placeholder";

export default function CommissionBulkPage() {
  return (
    <SectionPlaceholder
      icon={Layers}
      title="Bulk entry"
      description="Paste or upload a month of sales figures for the whole team at once, instead of entering each staff member individually."
    />
  );
}
