"use client";

import { useEffect, useRef, useState } from "react";
import { clearArrival, hasArrival } from "@/lib/arrival";
import { StripeArrowPlate, stripeLegsMidX } from "@/components/stripe-arrow";

/**
 * The launcher's PERMANENT racing-stripe ribbon: rises from the page's bottom
 * edge near the right side, takes a deck-style concentric left turn at the
 * hero card's height (the bend hides behind the opaque card) and runs out the
 * viewport's left edge. EVERY visit plays the draw-in: the band EXTENDS along
 * that route (line-draw dash animation), chevron arrow leading and rotating
 * through the bend until it exits left; the finished ribbon then stays.
 *
 * The draw-in runs on the Web Animations API, NOT CSS keyframes: each stripe
 * gets its own keyframe offsets computed from the REAL segment lengths
 * (leg / arc / run), so speed is constant along the whole route — no braking
 * into the bend, no lurch out of it — while all four heads still cross the
 * segment boundaries together (outer stripes sweep their longer arcs faster).
 *
 * Positioned absolutely BEHIND the page content (-z-10) so cards and the hero
 * paint over it; geometry is measured from the live hero rect and re-measured
 * on resize. Phones skip the ribbon; reduced-motion gets it pre-drawn.
 */

const BAR_H = 16;
const STEP = 36; // center-to-center stripe spacing, preserved through the arc
/** Top run → bottom run. Through the bend this reverses (top run = outermost
 * leg), so the upward LEGS read yellow/yellow/BLUE/yellow left→right — blue
 * third, matching the login band's legs for a continuous cut. */
const STRIPE_COLORS = [
  "var(--color-accent)",
  "var(--color-brand)",
  "var(--color-accent)",
  "var(--color-accent)",
];
const INNER_R = 64; // innermost corner radius
const EXIT_PAD = 240; // horizontal runs end this far past the viewport's left edge
const BOTTOM_PAD = 140; // paths start this far below the page bottom (hides the arrow's start)
/** Arrow anchor rides this far ahead of the band's heads — tight, so plate
 * and heads turn the bend as one unit instead of the plate floating alone. */
const ARROW_LEAD = 56;
const RUN_MS = 2000;
const RUN_DELAY_MS = 300;
/** Gentle start whose END slope is 1, handing over to linear seamlessly. */
const EASE_IN_UNIT = "cubic-bezier(0.45, 0, 0.67, 0.67)";

type Geom = {
  w: number; // page-root width (the svg viewBox MUST match the element box 1:1,
  h: number; // or the browser scales the artwork — paths may overdraw it freely)
  bottom: number; // legs start here: content bottom or viewport bottom, whichever is lower
  heroMid: number; // hero card's vertical middle, in page-root coords
  legMidX: number; // legs' middle line (shared with the login band), page-root coords
  exitX: number; // past the viewport's left edge, in page-root coords
};

/** All route geometry, derived purely from the measured Geom — shared by the
 * render (paths, dasharray) and the draw-in effect (keyframe distances). */
function buildRibbon(geom: Geom) {
  const rMid = INNER_R + 1.5 * STEP;
  // Shared arc center (concentric corner): legs at cx + r, runs at cy - r.
  const cx = geom.legMidX - rMid;
  const cy = geom.heroMid + rMid;
  const startY = geom.bottom + BOTTOM_PAD;
  const legLen = startY - cy; // identical for every stripe
  const run = cx - geom.exitX; // identical for every stripe
  const flowPath = (r: number) =>
    // Up from below the page bottom, quarter-turn left (sweep 0), out the left.
    `M ${cx + r} ${startY} V ${cy} A ${r} ${r} 0 0 0 ${cx} ${cy - r} H ${geom.exitX}`;
  const arc = (r: number) => (Math.PI / 2) * r;
  const stripes = STRIPE_COLORS.map((color, i) => {
    // Wider arcs end higher: the TOP run needs the LARGEST radius.
    const r = INNER_R + (3 - i) * STEP;
    return { color, d: flowPath(r), len: legLen + arc(r) + run, arc: arc(r) };
  });
  const arcMid = arc(rMid);
  const lenMid = legLen + arcMid + run;
  return {
    stripes,
    legLen,
    run,
    arcMid,
    lenMid,
    arrowD: flowPath(rMid),
    // Keyframe time offsets = the MID line's cumulative distance fractions:
    // constant speed for the band as a whole, heads synced at the boundaries.
    p1: legLen / lenMid,
    p2: (legLen + arcMid) / lenMid,
  };
}

export function HubStripeBand() {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ geom: Geom; animate: boolean } | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = (animate: boolean) => {
      const box = boxRef.current;
      const hero = document.getElementById("hub-hero");
      if (!box || !hero || window.innerWidth < 1024) {
        setState(null);
        return;
      }
      const b = box.getBoundingClientRect();
      const hr = hero.getBoundingClientRect();
      setState({
        animate,
        geom: {
          w: b.width,
          h: b.height,
          bottom: Math.max(b.height, window.innerHeight - b.top),
          heroMid: hr.top + hr.height / 2 - b.top,
          legMidX: stripeLegsMidX(window.innerWidth) - b.left,
          exitX: -b.left - EXIT_PAD,
        },
      });
    };
    // Consume the sign-in arrival mark (it already silenced the loading clip
    // during this navigation); the draw-in itself plays on EVERY visit.
    if (hasArrival()) clearArrival();
    raf = requestAnimationFrame(() => measure(true));
    const onResize = () => {
      cancelAnimationFrame(raf);
      // After a resize just snap to the finished ribbon at the new geometry.
      raf = requestAnimationFrame(() => measure(false));
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // The draw-in itself (Web Animations API; see the component docblock).
  useEffect(() => {
    if (!state?.animate) return;
    const box = boxRef.current;
    if (!box) return;
    const g = buildRibbon(state.geom);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opts: KeyframeAnimationOptions = {
      duration: reduced ? 0 : RUN_MS,
      delay: reduced ? 0 : RUN_DELAY_MS,
      easing: "linear",
      fill: "both",
    };
    const anims: Animation[] = [];
    box.querySelectorAll<SVGPathElement>("path").forEach((el, i) => {
      const s = g.stripes[i];
      if (!s) return;
      anims.push(
        el.animate(
          [
            { strokeDashoffset: `${s.len}px`, easing: EASE_IN_UNIT },
            { strokeDashoffset: `${s.len - g.legLen}px`, offset: g.p1 },
            { strokeDashoffset: `${g.run}px`, offset: g.p2 },
            { strokeDashoffset: "0px" },
          ],
          opts,
        ),
      );
    });
    const arrow = box.querySelector<HTMLElement>("[data-arrow]");
    if (arrow) {
      anims.push(
        arrow.animate(
          [
            { offsetDistance: `${ARROW_LEAD}px`, easing: EASE_IN_UNIT },
            { offsetDistance: `${g.legLen + ARROW_LEAD}px`, offset: g.p1 },
            { offsetDistance: `${g.legLen + g.arcMid + ARROW_LEAD}px`, offset: g.p2 },
            { offsetDistance: `${g.lenMid + ARROW_LEAD}px` }, // clamps at the end, off-screen
          ],
          opts,
        ),
      );
    }
    return () => anims.forEach((a) => a.cancel());
  }, [state]);

  let body = null;
  if (state) {
    const g = buildRibbon(state.geom);
    body = (
      <>
        <svg
          className="h-full w-full overflow-visible"
          viewBox={`0 0 ${state.geom.w} ${state.geom.h}`}
          fill="none"
        >
          {g.stripes.map((s, i) => (
            <path
              key={i}
              d={s.d}
              stroke={s.color}
              strokeWidth={BAR_H}
              style={{
                // One dash the length of the path; the draw-in slides the
                // offset len -> 0 and the filled end state IS the ribbon.
                strokeDasharray: `${s.len}`,
                strokeDashoffset: state.animate ? s.len : 0,
              }}
            />
          ))}
        </svg>
        {state.animate && (
          <div
            data-arrow
            className="absolute left-0 top-0"
            style={
              {
                offsetPath: `path("${g.arrowD}")`,
                offsetRotate: "auto",
                offsetDistance: `${ARROW_LEAD}px`,
              } as React.CSSProperties
            }
          >
            <StripeArrowPlate />
          </div>
        )}
      </>
    );
  }

  return (
    <div
      ref={boxRef}
      aria-hidden
      // -z-10: the PERMANENT ribbon lives BEHIND the page content — tool
      // cards and the hero paint over it (the hero still hides the bend);
      // it shows in the margins, grid gaps and page bottom, deck-style.
      className="pointer-events-none absolute inset-0 -z-10 hidden lg:block"
    >
      {body}
    </div>
  );
}
