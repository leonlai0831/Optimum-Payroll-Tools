import Link from "next/link";
import {
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  Megaphone,
  ShieldCheck,
  Trophy,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/auth/session";
import { getCapabilities } from "@/lib/auth/permissions";
import type { Capability } from "@/lib/auth/types";
import type { Brand } from "@/components/brand-shell";

type Tool = {
  href?: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  disabled?: boolean;
  cap?: Capability;
  /** Which brand this tool belongs to on the launcher. Defaults to swim. */
  brand?: Brand;
};

const TOOLS: Tool[] = [
  {
    // Land on History first; the Calculator stays a tab inside the module.
    href: "/allowance/history",
    title: "Staff Allowance",
    subtitle: "Full-time staff monthly allowance · start of month",
    icon: Wallet,
    cap: "run_allowance",
  },
  {
    href: "/kpi/history",
    title: "Instructor KPI Bonus",
    subtitle: "Instructor KPI score & bonus · ~mid-month",
    icon: Trophy,
    cap: "run_kpi",
  },
  {
    href: "/staff",
    title: "Staff",
    subtitle: "Employee directory, profiles & notes",
    icon: Users,
    cap: "view_all_staff",
  },
  {
    href: "/assessment",
    title: "Instructor Assessment",
    subtitle: "Observation form · scores feed the KPI bonus",
    icon: ClipboardCheck,
    cap: "edit_appraisals",
  },
  {
    title: "Admin KPI Bonus",
    subtitle: "Coming soon",
    icon: ShieldCheck,
    disabled: true,
    cap: "run_kpi",
  },
  {
    href: "/commission",
    title: "Staff Earnings",
    subtitle: "Gym staff pay · commission, coaching income & bonuses",
    icon: Dumbbell,
    cap: "run_commission",
    brand: "fit",
  },
  {
    href: "/marketing",
    title: "Marketing KPI",
    subtitle: "Marketing performance & campaign KPIs",
    icon: Megaphone,
    brand: "marketing",
  },
];

/** Launcher groups, in display order. */
const BRAND_GROUPS: { brand: Brand; label: string }[] = [
  { brand: "swim", label: "Optimum Swim School" },
  { brand: "fit", label: "Optimum Fit" },
  { brand: "marketing", label: "Optimum Marketing" },
];

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const disabled = tool.disabled || !tool.href;
  const body = (
    <Card
      className={cn(
        "group h-full p-5 transition-all duration-150",
        disabled
          ? "opacity-60"
          : "hover:-translate-y-0.5 hover:border-brand hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
            disabled
              ? "bg-gray-100 text-gray-400"
              : "bg-brand-light text-brand group-hover:bg-brand group-hover:text-white",
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        {disabled ? (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-400">
            Soon
          </span>
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand" />
        )}
      </div>
      <div className="mt-3 text-base font-bold text-gray-900">{tool.title}</div>
      <p className="mt-1 text-sm text-gray-500">{tool.subtitle}</p>
    </Card>
  );

  return disabled ? (
    <div aria-disabled className="cursor-not-allowed">
      {body}
    </div>
  ) : (
    <Link href={tool.href!} className="block">
      {body}
    </Link>
  );
}

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const user = await getCurrentUser();
  const caps = user ? await getCapabilities(user) : new Set<Capability>();
  const tools = TOOLS.filter((tool) => !tool.cap || caps.has(tool.cap));
  if (user?.coachId && caps.has("view_own")) {
    tools.push({
      href: `/staff/${user.coachId}`,
      title: "My Profile",
      subtitle: "Your performance record",
      icon: UserCircle,
    });
  }

  return (
    <div className="fade-in space-y-6">
      <div>
        <h1 className="text-display text-gray-900">Optimum Payroll Tools</h1>
        <p className="mt-1 text-body text-muted">Choose a calculator to get started.</p>
      </div>

      {tools.length === 0 ? (
        <Card className="p-6 text-sm text-gray-500">
          No tools are available for your role yet.
        </Card>
      ) : (
        BRAND_GROUPS.map(({ brand, label }) => {
          const group = tools.filter((t) => (t.brand ?? "swim") === brand);
          if (group.length === 0) return null;
          return (
            // data-brand re-skins this group's cards (the Fit group renders black/yellow).
            <section key={brand} data-brand={brand} className="space-y-3">
              <h2 className="text-overline text-gray-400">{label}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.map((tool) => (
                  <ToolCard key={tool.title} tool={tool} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
