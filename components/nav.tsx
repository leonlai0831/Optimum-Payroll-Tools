"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/auth/types";

export function Nav({ email, role }: { email: string; role: Role }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur no-print">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo-full.png"
            alt="Optimum Swim School"
            width={1080}
            height={350}
            priority
            className="h-8 w-auto sm:h-9"
          />
          <span className="hidden h-6 w-px bg-gray-200 sm:block" aria-hidden />
          <span className="hidden text-sm font-semibold text-gray-500 sm:inline">Payroll Tools</span>
        </Link>

        <div className="flex items-center gap-2">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-xs font-medium text-gray-700">{email}</div>
            <div className="text-[11px] text-gray-400">{ROLE_LABELS[role]}</div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </nav>
  );
}
