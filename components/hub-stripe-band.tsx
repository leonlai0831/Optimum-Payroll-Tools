"use client";

import { useEffect, useRef, useState } from "react";
import { clearArrival, hasArrival } from "@/lib/arrival";
import { useLoaderOverlayUp } from "@/components/branded-loader";
import {
  STRIPE_ARROW_W,
  StripeArrowPlate,
  stripeLegsMidX,
} from "@/components/stripe-arrow";

/**
 * The launcher's PERMANENT racing-stripe ribbon: rises from the page's bottom
 * edge near the right side, takes a deck-style concentric left turn at the
 * hero card's height (the bend hides behind the opaque card) and runs out the
 * viewport's left edge. EVERY visit to the launcher plays the draw-in: the
 * band EXTENDS along that route (line-draw dash animation), chevron arrow
 * leading and rotating through the bend until it exits left; the finished
 * ribbon then stays for the rest of the visit.
 *
 * Positioned absolutely inside the (relative) launcher page root so it
 * scrolls with the content. Geometry is measured from the live hero rect
 * (and re-measured on resize); phones skip the ribbon entirely.
 * Reduced-motion users get the finished ribbon instantly (global rule).
 */

const BAR_H = 16;
const STEP = 36; // center-to-center stripe spacing, preserved through the arc
/** Top run → bottom run. Chosen so the upward LEGS read yellow/blue/yellow/
 * yellow left→right — the same order the login band's legs exit with — so
 * the login → dashboard cut keeps each stripe's color in place. (Radii map
 * top run → outermost leg, which reverses the order through the bend.) */
const STRIPE_COLORS = [
  "var(--color-accent)",
  "var(--color-accent)",
  "var(--color-brand)",
  "var(--color-accent)",
];
const INNER_R = 64; // innermost corner radius
const EXIT_PAD = 240; // horizontal runs end this far past the viewport's left edge
const BOTTOM_PAD = 140; // paths start this far below the page bottom (hides the arrow's start)
const ARROW_LEAD = 96; // arrow anchor rides this far ahead of the band's heads

type Geom = {
  w: number; // page-root width
  h: number; // legs run to here: the content's bottom or the viewport's, whichever is lower
  heroMid: number; // hero card's vertical middle, in page-root coords
  legMidX: number; // legs' middle line (shared with the login band), page-root coords
  exitX: number; // past the viewport's left edge, in page-root coords
};

export function HubStripeBand() {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ geom: Geom; animate: boolean } | null>(null);
  // Returning from another module, the loading overlay plays its
  // finish-the-cycle exit ON TOP of this page — hold the draw-in (paths
  // parked undrawn) until the overlay is fully gone, then run it.
  const overlayUp = useLoaderOverlayUp();

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
          // The ribbon runs the FULL height: down to the content's bottom
          // (it lengthens with the page as the launcher grows / scrolls),
          // and at least to the viewport's bottom on short pages.
          h: Math.max(b.height, window.innerHeight - b.top),
          heroMid: hr.top + hr.height / 2 - b.top,
          // Same middle line as the login band's exit legs, so the
          // login → dashboard cut reads continuous.
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

  let body = null;
  if (state) {
    const running = state.animate && !overlayUp;
    const { w, h, heroMid, legMidX, exitX } = state.geom;
    const rMid = INNER_R + 1.5 * STEP;
    // Shared arc center (concentric corner): legs at cx + r, runs at cy - r.
    const cx = legMidX - rMid;
    const cy = heroMid + rMid;
    const startY = h + BOTTOM_PAD;
    const legLen = startY - cy; // identical for every stripe
    const run = cx - exitX; // identical for every stripe
    const flowPath = (r: number) =>
      // Up from below the page bottom, quarter-turn left (sweep 0), out the left.
      `M ${cx + r} ${startY} V ${cy} A ${r} ${r} 0 0 0 ${cx} ${cy - r} H ${exitX}`;
    const arc = (r: number) => (Math.PI / 2) * r;
    const flowLen = (r: number) => legLen + arc(r) + run;
    const stripes = STRIPE_COLORS.map((color, i) => {
      // Wider arcs end higher: the TOP run needs the LARGEST radius.
      const r = INNER_R + (3 - i) * STEP;
      return { color, d: flowPath(r), len: flowLen(r), arc: arc(r) };
    });

    body = (
      <>
        <svg className="h-full w-full overflow-visible" viewBox={`0 0 ${w} ${h}`} fill="none">
          {stripes.map((s, i) => (
            <path
              key={i}
              d={s.d}
              stroke={s.color}
              strokeWidth={BAR_H}
              className={running ? "hub-flow-run" : undefined}
              style={
                state.animate
                  ? ({
                      // Classic line-draw: one dash the length of the path,
                      // offset slides len -> 0 so the ribbon extends from its
                      // bottom anchor; the filled end state IS the ribbon.
                      // The intermediate stops (segment boundaries) keep all
                      // four heads level outside the bend — see globals.css.
                      // The inline offset parks the path UNDRAWN while the
                      // run class is withheld (loading overlay still up).
                      strokeDasharray: `${s.len}`,
                      strokeDashoffset: s.len,
                      "--dash-from": `${s.len}px`,
                      "--dash-leg": `${s.len - legLen}px`, // head at the corner
                      "--dash-arc": `${run}px`, // head out of the bend
                      "--dash-to": "0px",
                    } as React.CSSProperties)
                  : undefined
              }
            />
          ))}
        </svg>
        {running && (
          <div
            className="hub-arrow-run absolute left-0 top-0"
            style={
              {
                offsetPath: `path("${flowPath(rMid)}")`,
                offsetRotate: "auto",
                // Constant ARROW_LEAD ahead of the heads at every shared stop.
                "--arrow-from": `${ARROW_LEAD}px`,
                "--arrow-leg": `${legLen + ARROW_LEAD}px`,
                "--arrow-arc": `${legLen + arc(rMid) + ARROW_LEAD}px`,
                "--arrow-to": `${flowLen(rMid) + ARROW_LEAD}px`, // clamps at the path end, off-screen
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
      className="pointer-events-none absolute inset-0 hidden lg:block"
    >
      {body}
    </div>
  );
}
