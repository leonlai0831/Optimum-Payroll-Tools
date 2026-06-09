"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import type { Role } from "@/lib/auth/types";

export type Brand = "swim" | "fit" | "marketing" | "system";

/**
 * Which brand a route belongs to. Everything under /commission is Optimum Fit
 * (gym); the rest of the app is Optimum Swim School. Keep this the single source
 * of truth so the skin, logo, and nav all agree.
 */
export function brandForPath(pathname: string): Brand {
  return pathname.startsWith("/commission") ? "fit" : "swim";
}

/**
 * App shell that applies the current brand. `data-brand` scopes the CSS-variable
 * skin (see globals.css), so the nav + page re-color automatically without any
 * component changes; the nav also swaps its logo.
 */
export function BrandShell({
  email,
  role,
  children,
}: {
  email: string;
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const brand = brandForPath(pathname);
  return (
    <div data-brand={brand} className="min-h-screen">
      <Nav email={email} role={role} brand={brand} />
      <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
    </div>
  );
}
