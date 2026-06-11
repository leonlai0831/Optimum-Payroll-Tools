"use client";

import { useEffect, useRef, useState } from "react";
import { clearArrival, hasArrival } from "@/lib/arrival";
import { STRIPE_ARROW_W, StripeArrowPlate } from "@/components/stripe-arrow";

/**
 * The launcher's PERMANENT racing-stripe ribbon: rises from the page's bottom
 * edge near the right side, takes a deck-style concentric left turn at the
 * hero card's height (the bend hides behind the opaque card) and runs out the
 * viewport's left edge. It is always there on lg+ — arriving from a fresh
 * sign-in just plays its draw-in once: the band EXTENDS along that route
 * (line-draw dash animation), chevron arrow leading and rotating through the
 * bend until it exits left; the finished ribbon then stays for good.
 *
 * Positioned absolutely inside the (relative) launcher page root so it
 * scrolls with the content. Geometry is measured from the live hero rect
 * (and re-measured on resize); phones skip the ribbon entirely.
 * Reduced-motion users get the finished ribbon instantly (global rule).
 */

const BAR_H = 16;
const STEP = 36; // center-to-center stripe spacing, preserved through the arc
/** Top run → bottom run: yellow / blue / yellow / yellow (deck order). */
const STRIPE_COLORS = [
  "var(--color-accent)",
  "var(--color-brand)",
  "var(--color-accent)",
  "var(--color-accent)",
];
const INNER_R = 64; // innermost corner radius
const LEG_MID_X = 140; // the legs' middle line, this far in from the viewport's right
const EXIT_PAD = 240; // horizontal runs end this far past the viewport's left edge

type Geom = {
  w: number; // page-root width
  h: number; // page-root height (legs run to the content's bottom)
  heroMid: number; // hero card's vertical middle, in page-root coords
  legMidX: number; // legs' middle line, in page-root coords
  exitX: number; // past the viewport's left edge, in page-root coords
};

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
          heroMid: hr.top + hr.height / 2 - b.top,
          legMidX: window.innerWidth - LEG_MID_X - b.left,
          exitX: -b.left - EXIT_PAD,
        },
      });
    };
    const arrived = hasArrival();
    if (arrived) clearArrival();
    raf = requestAnimationFrame(() => measure(arrived));
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
    const { w, h, heroMid, legMidX, exitX } = state.geom;
    const rMid = INNER_R + 1.5 * STEP;
    // Shared arc center (concentric corner): legs at cx + r, runs at cy - r.
    const cx = legMidX - rMid;
    const cy = heroMid + rMid;
    const flowPath = (r: number) =>
      // Up from the page bottom, quarter-turn left (sweep 0), out the left.
      `M ${cx + r} ${h} V ${cy} A ${r} ${r} 0 0 0 ${cx} ${cy - r} H ${exitX}`;
    const flowLen = (r: number) => h - cy + (Math.PI / 2) * r + (cx - exitX);
    const stripes = STRIPE_COLORS.map((color, i) => {
      // Wider arcs end higher: the TOP run needs the LARGEST radius.
      const r = INNER_R + (3 - i) * STEP;
      return { color, d: flowPath(r), len: flowLen(r) };
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
              className={state.animate ? "hub-flow-run" : undefined}
              style={
                state.animate
                  ? ({
                      // Classic line-draw: one dash the length of the path,
                      // offset slides len -> 0 so the ribbon extends from its
                      // bottom anchor; the filled end state IS the ribbon.
                      strokeDasharray: `${s.len}`,
                      "--dash-from": `${s.len}px`,
                      "--dash-to": "0px",
                    } as React.CSSProperties)
                  : undefined
              }
            />
          ))}
        </svg>
        {state.animate && (
          <div
            className="hub-arrow-run absolute left-0 top-0"
            style={
              {
                offsetPath: `path("${flowPath(rMid)}")`,
                offsetRotate: "auto",
                "--arrow-from": `${STRIPE_ARROW_W / 2}px`,
                "--arrow-to": `${flowLen(rMid)}px`, // path end, past the left edge
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
