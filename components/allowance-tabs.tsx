"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, Coins, History } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/allowance", label: "Calculator", icon: Calculator, exact: true },
  { href: "/allowance/history", label: "History", icon: History, exact: false },
  { href: "/allowance/settings", label: "Rates", icon: Coins, exact: false },
];

export function AllowanceTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-gray-200 no-print">
      {tabs.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition",
              active
                ? "border-brand bg-brand-light text-brand"
                : "border-transparent text-gray-600 hover:bg-gray-100",
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
