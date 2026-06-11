"use client";

import { useEffect, useState } from "react";
import { ARRIVAL_READY_EVENT, hasArrival } from "@/lib/arrival";
import { cn } from "@/lib/utils";

/**
 * The dashboard half of the login → dashboard curtain. Login covers its last
 * frame with a paper panel rising from the bottom; this one mounts (in
 * BrandShell, so it exists from the very first frame of the (app) layout,
 * covering the loading fallback and any hero pop-in) already-covering, then
 * lifts upward once the launcher signals it has painted
 * (ARRIVAL_READY_EVENT, fired by HubStripeBand) — or after a safety timeout
 * so a missing signal can never trap the user under the curtain.
 */
const REVEAL_MS = 550; // matches .curtain-reveal in globals.css
const SAFETY_MS = 2500;

export function ArrivalCurtain() {
  // Lazy initializer: in a client-side navigation this runs synchronously
  // before first paint, so the cover is up before anything can flash.
  const [phase, setPhase] = useState<"hidden" | "covering" | "revealing">(() =>
    hasArrival() ? "covering" : "hidden",
  );

  useEffect(() => {
    if (phase === "covering") {
      const reveal = () => setPhase("revealing");
      window.addEventListener(ARRIVAL_READY_EVENT, reveal);
      const t = setTimeout(reveal, SAFETY_MS);
      return () => {
        window.removeEventListener(ARRIVAL_READY_EVENT, reveal);
        clearTimeout(t);
      };
    }
    if (phase === "revealing") {
      const t = setTimeout(() => setPhase("hidden"), REVEAL_MS);
      return () => clearTimeout(t);
    }
  }, [phase]);

  if (phase === "hidden") return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 z-50 bg-background",
        phase === "revealing" && "curtain-reveal",
      )}
    />
  );
}
