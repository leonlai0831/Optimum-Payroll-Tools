"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calculator,
  Coins,
  History,
  Home,
  LayoutDashboard,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SectionItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
type SectionConfig = { title: string; items: SectionItem[] };

const NAVS = {
  allowance: {
    title: "Staff Allowance",
    items: [
      { href: "/allowance", label: "Calculator", icon: Calculator, exact: true },
      { href: "/allowance/history", label: "History", icon: History },
      { href: "/allowance/settings", label: "Rates", icon: Coins },
    ],
  },
  kpi: {
    title: "Instructor KPI Bonus",
    items: [
      { href: "/kpi", label: "Calculator", icon: LayoutDashboard, exact: true },
      { href: "/kpi/history", label: "History", icon: History },
      { href: "/kpi/trends", label: "Trends", icon: BarChart3 },
      { href: "/kpi/settings", label: "Settings", icon: Settings },
    ],
  },
} satisfies Record<string, SectionConfig>;

export function SectionNav({ section }: { section: keyof typeof NAVS }) {
  const pathname = usePathname();
  const { title, items } = NAVS[section];

  return (
    <div className="flex flex-wrap items-center gap-2 no-print">
      <Link
        href="/"
        className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
      >
        <Home className="h-4 w-4" />
        <span className="hidden sm:inline">Home</span>
      </Link>
      <span className="px-1 text-sm font-bold text-gray-900">{title}</span>
      <span className="mx-1 hidden h-5 w-px bg-gray-200 sm:block" aria-hidden />
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
