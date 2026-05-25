import Link from "next/link";
import { ShieldCheck, Trophy, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type Tool = {
  href?: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  disabled?: boolean;
};

const TOOLS: Tool[] = [
  {
    href: "/allowance",
    title: "Staff Allowance",
    subtitle: "Full-time staff monthly allowance · start of month",
    icon: Wallet,
  },
  {
    href: "/kpi",
    title: "Instructor KPI Bonus",
    subtitle: "Instructor KPI score & bonus · ~mid-month",
    icon: Trophy,
  },
  {
    title: "Admin KPI Bonus",
    subtitle: "Coming soon",
    icon: ShieldCheck,
    disabled: true,
  },
];

export default function HubPage() {
  return (
    <div className="fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Optimum Payroll Tools</h1>
        <p className="mt-1 text-sm text-gray-500">Choose a calculator.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const disabled = tool.disabled || !tool.href;
          const body = (
            <Card
              className={cn(
                "h-full p-5",
                disabled ? "opacity-60" : "transition hover:border-brand hover:shadow-md",
              )}
            >
              <div
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-lg",
                  disabled ? "bg-gray-100 text-gray-400" : "bg-brand-light text-brand",
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="mt-3 text-base font-bold text-gray-900">{tool.title}</div>
              <p className="mt-1 text-sm text-gray-500">{tool.subtitle}</p>
            </Card>
          );

          return disabled ? (
            <div key={tool.title} aria-disabled className="cursor-not-allowed">
              {body}
            </div>
          ) : (
            <Link key={tool.title} href={tool.href!} className="block">
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
