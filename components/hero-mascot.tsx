"use client";

import { useRef, useState } from "react";
import { LoginMascot, type MascotState } from "@/components/login-mascot";

/** A tap holds the reaction pose this long (mirrors the login card's toy). */
const REACT_MS = 1100;

/**
 * The swimmer mascot floating in the launcher hero's wave, logo-style. It
 * idles (slow blink) with the easter-egg bob; tapping it pokes a transient
 * reaction, alternating "boop" surprise with a cheer — the same toy as the
 * login card's mascot. Rendered BEFORE the wave svg so the crest paints over
 * its lower half (half-submerged; the resting hands read as paddling).
 */
export function HeroMascot() {
  const [state, setState] = useState<MascotState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flip = useRef(false);

  function onClick() {
    flip.current = !flip.current;
    setState(flip.current ? "boop" : "cheer");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), REACT_MS);
  }

  return (
    <div
      className="absolute bottom-6 right-6 w-12 cursor-pointer select-none sm:bottom-8 sm:right-10 sm:w-16"
      aria-hidden
      onClick={onClick}
    >
      <div className="login-swimmer-bob">
        <LoginMascot state={state} className="h-auto w-full" />
      </div>
    </div>
  );
}
