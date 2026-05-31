"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Calculator,
  History,
  Home,
  Layers,
  LayoutDashboard,
  Link2,
  ScrollText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Capability } from "@/lib/auth/types";

type Requirement = { cap?: Capability; superAdmin?: boolean };
type SectionItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  requires?: Requirement;
};
type SectionConfig = { title: string; items: SectionItem[] };

const NAVS: Record<"allowance" | "kpi" | "staff", SectionConfig> = {
  allowance: {
    title: "Staff Allowance",
    items: [
      { href: "/allowance", label: "Calculator", icon: Calculator, exact: true },
      { href: "/allowance/bulk", label: "Bulk entry", icon: Layers },
      { href: "/allowance/history", label: "History", icon: History },
      { href: "/allowance/trends", label: "Trends", icon: BarChart3 },
      { href: "/allowance/settings", label: "Settings", icon: SlidersHorizontal },
    ],
  },
  kpi: {
    title: "Instructor KPI Bonus",
    items: [
      { href: "/kpi", label: "Calculator", icon: LayoutDashboard, exact: true },
      { href: "/kpi/links", label: "Links", icon: Link2, requires: { cap: "view_all_staff" } },
      { href: "/kpi/history", label: "History", icon: History },
      { href: "/kpi/trends", label: "Trends", icon: BarChart3 },
      { href: "/kpi/settings", label: "Settings", icon: Settings },
    ],
  },
  staff: {
    title: "Staff",
    items: [
      {
        href: "/staff",
        label: "Directory",
        icon: Users,
        exact: true,
        requires: { cap: "view_all_staff" },
      },
      {
        href: "/staff/settings",
        label: "Settings",
        icon: SlidersHorizontal,
        requires: { cap: "view_all_staff" },
      },
      { href: "/staff/users", label: "Users", icon: UserCog, requires: { cap: "manage_users" } },
      {
        href: "/staff/audit",
        label: "Audit log",
        icon: ScrollText,
        requires: { cap: "view_audit" },
      },
      {
        href: "/staff/permissions",
        label: "Permissions",
        icon: ShieldCheck,
        requires: { superAdmin: true },
      },
    ],
  },
};

function allowed(req: Requirement | undefined, caps: Capability[], isSuperAdmin: boolean): boolean {
  if (!req) return true;
  if (req.superAdmin && !isSuperAdmin) return false;
  if (req.cap && !caps.includes(req.cap)) return false;
  return true;
}

export function SectionNav({
  section,
  caps = [],
  isSuperAdmin = false,
}: {
  section: keyof typeof NAVS;
  caps?: Capability[];
  isSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const { title, items } = NAVS[section];
  const visible = items.filter((it) => allowed(it.requires, caps, isSuperAdmin));

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
      {visible.map(({ href, label, icon: Icon, exact }) => {
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
