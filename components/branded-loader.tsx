"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_SRC = "/logo-animation.mp4";
const FIT_SRC = "/logo-fit-animation.mp4";
const DEFAULT_LABEL = "Loading…";

/** Acceleration applied to the clip once the page is ready, so a fast load
 * still finishes the cycle — just quicker — instead of cutting off mid-frame. */
const FINISH_RATE = 2.75;
/** Give up waiting for `ended` after this long (clip missing / still buffering). */
const FINISH_TIMEOUT_MS = 4000;
/** Matches the overlay's opacity transition. */
const FADE_MS = 300;

/**
 * Module-level store so every loading.tsx fallback drives ONE persistent
 * overlay (LoaderOverlayHost, mounted in BrandShell). A Suspense fallback
 * can't control its own lifetime — React swaps it out the instant the page
 * resolves, which used to cut the clip off mid-cycle — so the video lives
 * OUTSIDE Suspense: fallbacks just check in/out, and the host lets the
 * current cycle finish (sped up) before fading the overlay away.
 */
/** `src` undefined = no explicit clip requested — the host falls back to the
 * brand of the page the navigation STARTED from (see LoaderOverlayHost). */
type Snapshot = { active: number; src: string | undefined; label: string };
let snapshot: Snapshot = { active: 0, src: undefined, label: DEFAULT_LABEL };
const listeners = new Set<() => void>();
function emit(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getSnapshot = () => snapshot;

/**
 * The loading.tsx fallback. Visuals are drawn by LoaderOverlayHost; this just
 * registers the pending load and holds the page area open behind the overlay.
 * Omit `src` to follow the brand the user navigated FROM (e.g. the brand-
 * neutral Home); pass one to pin a destination clip (commission → Fit).
 */
export function BrandedLoader({
  label = DEFAULT_LABEL,
  src,
}: {
  label?: string;
  src?: string;
}) {
  useEffect(() => {
    emit({ active: snapshot.active + 1, src, label });
    return () => emit({ active: Math.max(0, snapshot.active - 1) });
  }, [src, label]);
  return <div className="min-h-[45vh]" aria-hidden />;
}

type ExitPhase = "finishing" | "fading" | "hidden";
type Phase = "loading" | ExitPhase;

/**
 * The one overlay that actually plays the clip. Mounted once in BrandShell so
 * it survives Suspense boundaries. Lifecycle: loading (loop at 1×) →
 * finishing (page ready: loop off, FINISH_RATE until `ended`) → fading →
 * hidden. A navigation that starts mid-finish/fade rewinds straight back to
 * loading. Reduced-motion users skip the finish-the-cycle delay entirely.
 */
export function LoaderOverlayHost({ brand }: { brand: string }) {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const active = snap.active > 0;
  // The brand of the page the user is ON, frozen while a load is in flight so
  // a fallback without an explicit clip shows where the navigation STARTED
  // (gym module → Home plays the Fit clip). Read the store live: the
  // fallback's begin() effect runs before this one in the same commit, so the
  // origin never gets overwritten by the destination's brand.
  const originBrandRef = useRef(brand);
  useEffect(() => {
    if (getSnapshot().active === 0) originBrandRef.current = brand;
  });
  const src = snap.src ?? (originBrandRef.current === "fit" ? FIT_SRC : DEFAULT_SRC);
  // "loading" is derived from the store; only the exit animation needs state.
  // The render-time adjustment (not an effect) arms "finishing" the moment the
  // last pending load checks out, so the overlay never flashes a stale phase.
  const [exitPhase, setExitPhase] = useState<ExitPhase>("hidden");
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (!active) setExitPhase("finishing");
  }
  const phase: Phase = active ? "loading" : exitPhase;

  useEffect(() => {
    const video = videoRef.current;

    if (phase === "loading") {
      if (video) {
        video.loop = true;
        video.playbackRate = 1;
        void video.play().catch(() => {});
      }
      return;
    }

    if (phase === "finishing") {
      // Page is ready. Finish the current cycle fast instead of cutting it off
      // — unless the clip never actually started, or motion is reduced.
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || !video || video.paused || video.readyState < 2) {
        const t = setTimeout(() => setExitPhase("fading"), 0);
        return () => clearTimeout(t);
      }
      video.loop = false;
      video.playbackRate = FINISH_RATE;
      const onEnded = () => setExitPhase("fading");
      video.addEventListener("ended", onEnded);
      const t = setTimeout(onEnded, FINISH_TIMEOUT_MS);
      return () => {
        video.removeEventListener("ended", onEnded);
        clearTimeout(t);
      };
    }

    if (phase === "fading") {
      const t = setTimeout(() => {
        const v = videoRef.current;
        if (v) {
          v.pause();
          try {
            v.currentTime = 0; // rewind so the next load starts a fresh cycle
          } catch {
            /* not seekable — the next play() starts from wherever it can */
          }
        }
        setExitPhase("hidden");
      }, FADE_MS);
      return () => clearTimeout(t);
    }
  }, [phase, src]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background transition-opacity",
        phase === "hidden" && "hidden",
        phase === "fading" ? "opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      role="status"
      aria-live="polite"
    >
      {/* Keyed by src so switching brand sections (swim ↔ fit clip) remounts
          cleanly; the effect above restarts playback after the swap. */}
      <video
        key={src}
        ref={videoRef}
        className="w-44 max-w-[70vw] rounded-2xl shadow-sm sm:w-52"
        loop
        muted
        playsInline
        preload="auto"
        aria-label="Loading animation"
      >
        <source src={src} type="video/mp4" />
      </video>
      <p className="text-sm font-semibold tracking-wide text-brand">{snap.label}</p>
    </div>
  );
}
