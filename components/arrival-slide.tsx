"use client";

import { useState, type ReactNode } from "react";
import { hasArrival } from "@/lib/arrival";
import { cn } from "@/lib/utils";

/**
 * The launcher's page root. Arriving from a fresh sign-in, the whole page
 * descends into place from above (the second half of the login's
 * camera-pan: the login screen dropped away downward chasing the arrow) —
 * the ribbon draw-in starts during the descent. Normal visits keep the
 * usual fade-in. The arrival mark is only READ here (render-time, so the
 * very first paint already slides); HubStripeBand consumes/clears it.
 */
export function ArrivalSlide({ children }: { children: ReactNode }) {
  const [entering] = useState(() => hasArrival());
  return (
    <div
      suppressHydrationWarning
      className={cn("relative space-y-6", entering ? "screen-enter-down" : "fade-in")}
    >
      {children}
    </div>
  );
}
