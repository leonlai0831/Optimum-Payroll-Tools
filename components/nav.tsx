"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserCog } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/auth/types";
import type { Brand } from "@/components/brand-shell";

/**
 * Per-brand logo in the top nav. Both render side by side, in full color.
 * `h`/`hSm` are display heights (desktop/mobile). The Swim logo carries ~18%
 * built-in vertical padding (its ink fills ~64% of the box); the Fit logo has
 * none (ink fills 100%). Rendering Fit a notch shorter equalizes their optical
 * height so the lockup looks balanced.
 */
const BRANDS: Record<
  Brand,
  { src: string; alt: string; width: number; height: number; hCls: string }
> = {
  // hCls carries both heights as literals so Tailwind keeps the responsive variants.
  swim: { src: "/logo-full.png", alt: "Optimum Swim School", width: 1080, height: 350, hCls: "h-7 sm:h-9" },
  fit: { src: "/logo-fit.png", alt: "Optimum Fit", width: 1600, height: 355, hCls: "h-5 sm:h-6" },
};

export function Nav({ email, role }: { email: string; role: Role; brand?: Brand }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur no-print">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 sm:gap-3" aria-label="Home">
          {/* Both brand logos, side by side, in full color — on mobile too. */}
          <div className="flex items-center gap-2 sm:gap-3">
            {(["swim", "fit"] as Brand[]).map((key, i) => {
              const x = BRANDS[key];
              return (
                <div key={key} className="flex items-center gap-2 sm:gap-3">
                  {i > 0 && <span className="h-5 w-px bg-gray-200 sm:h-6" aria-hidden />}
                  <Image
                    src={x.src}
                    alt={x.alt}
                    width={x.width}
                    height={x.height}
                    priority
                    title={x.alt}
                    className={`${x.hCls} w-auto`}
                  />
                </div>
              );
            })}
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/account"
            title="My account"
            className="hidden text-right leading-tight sm:block rounded-md px-2 py-1 transition hover:bg-gray-100"
          >
            <div className="text-xs font-medium text-gray-700">{email}</div>
            <div className="text-[11px] text-gray-400">{ROLE_LABELS[role]}</div>
          </Link>
          <Link
            href="/account"
            title="My account"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-indigo-600 sm:hidden"
          >
            <UserCog className="h-4 w-4" />
          </Link>
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
