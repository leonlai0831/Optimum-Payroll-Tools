"use client";

import { useEffect, useState } from "react";
import { ARRIVAL_READY_EVENT, clearArrival, hasArrival } from "@/lib/arrival";
import { STRIPE_ARROW_W, StripeArrowPlate } from "@/components/stripe-arrow";

/**
 * The dashboard half of the login → dashboard stripe handoff. Plays exactly
 * once, when the launcher mounts with the arrival mark set: the band rises
 * from the bottom-right (legs clustered near the right edge), turns left with
 * a deck-style concentric corner AT the hero card's height — the bend itself
 * hides behind the opaque card — re-emerges from the card's left side and
 * runs off the viewport's left edge, chevron arrow leading and rotating
 * through the turn. Unlike the login band this one passes THROUGH (a fixed-
 * length snake: the tail follows the head out), leaving the launcher clean.
 *
 * It also fires ARRIVAL_READY_EVENT so the BrandShell curtain knows the page
 * is painted and can lift; the run's animation-delay (globals.css) starts it
 * as the reveal finishes. Reduced-motion is stilled by the global rule.
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
const SNAKE = 520; // the travelling band's length
const LEG_MID_X = 140; // the legs' middle line, this far in from the right edge
const EXIT_X = -240; // path end past the viewport's left edge
const ARROW_LEAD = 78; // arrow anchor rides this far ahead of the band's head

type Geom = { vw: number; vh: number; heroMid: number };

export function HubStripeBand() {
  const [geom, setGeom] = useState<Geom | null>(null);

  useEffect(() => {
    if (!hasArrival()) return;
    clearArrival();
    // Tell the curtain (BrandShell) the dashboard is painted; the band's own
    // animation-delay starts the run as the curtain finishes lifting.
    window.dispatchEvent(new Event(ARRIVAL_READY_EVENT));
    const hero = document.getElementById("hub-hero");
    if (!hero || window.innerWidth < 1024) return;
    const rect = hero.getBoundingClientRect();
    const frame = requestAnimationFrame(() =>
      setGeom({
        vw: window.innerWidth,
        vh: window.innerHeight,
        heroMid: rect.top + rect.height / 2,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!geom) return null;
  const { vw, vh, heroMid } = geom;

  const rMid = INNER_R + 1.5 * STEP;
  // Shared arc center: runs sit at cy - r (so the middle of the band crosses
  // the hero's middle), legs at cx + r.
  const cx = vw - LEG_MID_X - rMid;
  const cy = heroMid + rMid;
  const flowPath = (r: number) =>
    // Up from below the viewport, quarter-turn left (sweep 0), out the left.
    `M ${cx + r} ${vh + 80} V ${cy} A ${r} ${r} 0 0 0 ${cx} ${cy - r} H ${EXIT_X}`;
  const flowLen = (r: number) => vh + 80 - cy + (Math.PI / 2) * r + (cx - EXIT_X);
  const dashGap = flowLen(INNER_R + 3 * STEP) + SNAKE;

  const stripes = STRIPE_COLORS.map((color, i) => {
    // Wider arcs end higher: the TOP run needs the LARGEST radius.
    const r = INNER_R + (3 - i) * STEP;
    return { color, d: flowPath(r), len: flowLen(r) };
  });

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <svg className="h-full w-full" viewBox={`0 0 ${vw} ${vh}`} fill="none">
        {stripes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            stroke={s.color}
            strokeWidth={BAR_H}
            className="hub-flow-run"
            style={
              {
                strokeDasharray: `${SNAKE} ${dashGap}`,
                "--dash-from": `${SNAKE}px`, // head at the path start (below the fold)
                "--dash-to": `${-s.len}px`, // tail past the path end (off-screen left)
              } as React.CSSProperties
            }
          />
        ))}
      </svg>
      <div
        className="hub-arrow-run absolute left-0 top-0"
        style={
          {
            offsetPath: `path("${flowPath(rMid)}")`,
            offsetRotate: "auto",
            "--arrow-from": `${ARROW_LEAD - STRIPE_ARROW_W / 2}px`,
            "--arrow-to": `${flowLen(rMid)}px`, // path end, past the left edge
          } as React.CSSProperties
        }
      >
        <StripeArrowPlate />
      </div>
    </div>
  );
}
