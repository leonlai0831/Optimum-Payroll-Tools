"use client";

import { useRef, useState } from "react";
import { CiWave } from "@/components/ci-wave";
import { cn } from "@/lib/utils";

/** Clicking the painted wave runs its drift this much faster, for this long. */
const SURGE_RATE = 6;
const SURGE_MS = 2000;

/**
 * CiWave with the click-to-surge toy (login + launcher hero): clicking the
 * painted wave boosts the two drift layers' playbackRate (WAAPI — smooth
 * mid-cycle, where a CSS duration change would jump) for 2s plus a one-shot
 * crest rear-up (`ci-wave-surge`). Re-clicks extend the window; the rate is
 * set absolutely, never stacked. The wrapper stays pointer-events-none —
 * CiWave re-enables its painted paths only — so empty areas pass through.
 */
export function SplashWave({
  className,
  waveClassName,
}: {
  className?: string;
  waveClassName?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [surging, setSurging] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onClick() {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    for (const a of el.getAnimations({ subtree: true })) a.updatePlaybackRate(SURGE_RATE);
    setSurging(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const wave = ref.current;
      if (wave) for (const a of wave.getAnimations({ subtree: true })) a.updatePlaybackRate(1);
      setSurging(false);
    }, SURGE_MS);
  }

  return (
    <div ref={ref} className={cn("pointer-events-none", className)}>
      <CiWave className={cn(waveClassName, surging && "ci-wave-surge")} onClick={onClick} />
    </div>
  );
}
