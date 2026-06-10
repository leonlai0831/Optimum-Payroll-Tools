"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { LoaderOverlayHost } from "@/components/branded-loader";
import type { Role, ToolCategory } from "@/lib/auth/types";

/**
 * Launcher/skin brands = the assignable tool categories plus the super_admin-only
 * System group. Derived from ToolCategory so adding a category automatically
 * extends Brand (and the compiler flags every switch/group that must follow).
 */
export type Brand = ToolCategory | "system";

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
      {/* Persistent loading overlay — lives outside the Suspense boundaries so
          the clip can finish its cycle after a fast load (branded-loader.tsx).
          Inside the data-brand scope so the label adopts the brand color. */}
      <LoaderOverlayHost />
    </div>
  );
}
