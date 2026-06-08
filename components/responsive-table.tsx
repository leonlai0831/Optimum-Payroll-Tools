import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared mobile-first table wrappers (project hard rule: data must never
 * horizontal-scroll on a phone). Render the SAME rows twice — a card stack for
 * phones, the real table for desktop — and let these two components flip them at
 * the `lg` breakpoint, so every page picks the same boundary.
 *
 *   <MobileCards>{rows.map(r => <Card …/>)}</MobileCards>
 *   <DesktopTable><table>…</table></DesktopTable>
 *
 * Reference card/row markup: the KPI leaderboard in `components/dashboard.tsx`.
 * Pure presentational (no hooks) so it works in server or client components.
 */

/** Card stack shown below `lg`; hidden once the paired table appears. */
export function MobileCards({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("divide-y divide-gray-100 lg:hidden", className)}>{children}</div>;
}

/**
 * Table wrapper shown at `lg`+ (hidden on phones). Horizontal scroll is allowed
 * *here only* — phones get the paired <MobileCards> instead, never a side-scroll.
 */
export function DesktopTable({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("hidden overflow-x-auto lg:block", className)}>{children}</div>;
}
