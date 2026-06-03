import { Construction, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Placeholder for a section page that's scaffolded but not yet built. Uses the
 * brand tokens (bg-brand-light / text-brand), so under /commission it renders in
 * the Optimum Fit black/yellow skin automatically.
 */
export function SectionPlaceholder({
  title,
  description,
  icon: Icon = Construction,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
}) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="mt-3 text-lg font-bold text-gray-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">{description}</p>
      <p className="mt-4 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        Scaffold · coming in a later update
      </p>
    </Card>
  );
}
