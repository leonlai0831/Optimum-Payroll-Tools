"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, History, LayoutDashboard, LogOut, Settings, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/history", label: "History", icon: History },
  { href: "/trends", label: "Trends", icon: BarChart3 },
  { href: "/allowance", label: "Allowance", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur no-print">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo-mark.png"
            alt="Optimum Swim School"
            width={240}
            height={140}
            priority
            className="h-9 w-auto"
          />
          <div className="hidden sm:block">
            <p className="text-sm font-bold leading-tight text-gray-900">KPI Dashboard</p>
            <p className="text-[11px] text-gray-500">Optimum Swim School</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition sm:px-3",
                  active ? "bg-brand-light text-brand" : "text-gray-600 hover:bg-gray-100",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <button
            onClick={logout}
            title="Log out"
            className="ml-1 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
