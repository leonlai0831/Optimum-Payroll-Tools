"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function Nav() {
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
            src="/logo-mark.png"
            alt="Optimum Swim School"
            width={240}
            height={140}
            priority
            className="h-9 w-auto"
          />
          <div className="hidden sm:block">
            <p className="text-sm font-bold leading-tight text-gray-900">Optimum Payroll Tools</p>
            <p className="text-[11px] text-gray-500">Optimum Swim School</p>
          </div>
        </Link>

        <button
          onClick={logout}
          title="Log out"
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
