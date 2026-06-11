"use client";

import { useSyncExternalStore } from "react";
import {
  STRIPE_ARROW_TIP,
  STRIPE_ARROW_W,
  StripeArrowPlate,
  stripeLegsMidX,
} from "@/components/stripe-arrow";

/**
 * The login page's racing-stripe band, built as SVG so it can FLOW like the
 * gym deck's rounded-corner artwork instead of only translating. Each stripe
 * is a path — a horizontal run from off-screen left, a concentric quarter-arc
 * (inner stripe tight, outer stripes wider, exactly like the deck corner) just
 * right of the sign-in card, then a vertical leg out the top. The visible bar
 * is a stroke-dash "snake" on that path:
 *
 *   enter:  the whole band slides in from off-screen left (dashoffset) and
 *           rests short of the card, led by the chevron arrow
 *   exit:   the band EXTENDS (dash length grows, tail pinned to the viewport's
 *           left edge) — onward under the card, bending up immediately past
 *           its right side, out the top; the ribbon left behind spans
 *           left-edge → corner → top, like the deck slide
 *
 * The arrow — two big chevron strokes, yellow behind blue, matching the bar
 * thickness — rides the band's middle line via CSS motion path
 * (offset-path / offset-rotate:auto), so it leads the band in and rotates
 * upward through the bend on the way out. Keyframes live in globals.css and
 * read per-path distances from custom properties set here. Reduced-motion is
 * stilled by the global rule.
 *
 * Geometry mirrors the login layout's Tailwind values — keep in sync:
 *   card: max-w-md (448px), inside max-w-6xl + lg:px-12 → its left edge is
 *         vw - max(31rem, 50vw - 5rem); cluster lifted 4vh (optical center);
 *         card top at 50vh - 13.7rem - 4vh; the band floats BAND_RAISE above
 *         that so it clears the (lowered) tagline.
 */

const BAR_H = 16; // stripe thickness
const BAR_GAP = 20; // gap between stripes
const STRIPE_STEP = BAR_H + BAR_GAP; // center-to-center, preserved through the arc
/** Deck order, top to bottom: yellow / blue / yellow / yellow. */
const STRIPE_COLORS = [
  "var(--color-accent)",
  "var(--color-brand)",
  "var(--color-accent)",
  "var(--color-accent)",
];
const CARD_TOP_OFFSET = 219.2; // 13.7rem — card top above the centerline
const BAND_RAISE = 56; // band floats this far above the card's top edge
const INNER_R = 64; // innermost corner radius
const EXIT_Y = -160; // path end above the viewport (arrow fully clears it)
/** Bars stop this far short of the card; the chevron arrow floats in the gap. */
const BAR_INSET = 110;
const ARROW_TIP_GAP = 18; // resting clearance between the blue tip and the card

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
const getSize = () => `${window.innerWidth}x${window.innerHeight}`;
const getServerSize = () => "0x0";

export function LoginStripeBand({ sweeping }: { sweeping: boolean }) {
  const [vw, vh] = useSyncExternalStore(subscribeResize, getSize, getServerSize)
    .split("x")
    .map(Number);
  // The stacked phone layout has no band (and 0x0 covers SSR/first paint).
  if (vw < 1024) return null;

  const cardLeft = vw - Math.max(496, vw / 2 - 80); // 31rem | 50% - 5rem
  const bandTop = vh / 2 - CARD_TOP_OFFSET - 0.04 * vh - BAND_RAISE;
  // The upward legs sit on the SHARED middle line (stripeLegsMidX) so they
  // exit exactly where the dashboard ribbon's legs stand — the cut between
  // the two screens reads continuous. legs x = cornerX + r, mid r = 64+54.
  const cornerX = stripeLegsMidX(vw) - INNER_R - 1.5 * STRIPE_STEP;
  // Shared arc center (concentric corner): directly above the top stripe.
  const arcCy = bandTop + BAR_H / 2 - INNER_R;
  const snakeLen = cardLeft - BAR_INSET; // resting bar: viewport left → arrow gap

  const flowPath = (y: number, r: number) =>
    // Right along y, quarter-turn up (sweep 0 = the left turn), out the top.
    `M ${-vw} ${y} H ${cornerX} A ${r} ${r} 0 0 0 ${cornerX + r} ${arcCy} V ${EXIT_Y}`;
  const arc = (r: number) => (Math.PI / 2) * r;
  const flowLen = (r: number) => cornerX + vw + arc(r) + (arcCy - EXIT_Y);
  // How far the heads travel before the bend during the exit (same for all).
  const runExt = cornerX - (cardLeft - BAR_INSET);
  // Far larger than any path so exactly one dash is ever visible. Shared by
  // the rest and exit dash arrays so only the dash LENGTH interpolates.
  const dashGap = flowLen(INNER_R + 3 * STRIPE_STEP) + vw;

  const stripes = STRIPE_COLORS.map((color, i) => {
    const y = bandTop + BAR_H / 2 + i * STRIPE_STEP;
    const r = INNER_R + i * STRIPE_STEP;
    return { color, d: flowPath(y, r), len: flowLen(r), arc: arc(r) };
  });

  // The arrow rides the band's middle line (between stripes 2 and 3).
  const arrowR = INNER_R + 1.5 * STRIPE_STEP;
  const arrowD = flowPath(bandTop + BAR_H / 2 + 1.5 * STRIPE_STEP, arrowR);
  // Anchor = plate center; the blue tip leads it by (ARROW_TIP - ARROW_W/2).
  const arrowRest = vw + cardLeft - ARROW_TIP_GAP - (STRIPE_ARROW_TIP - STRIPE_ARROW_W / 2);
  // The anchor's resting lead over the bars' heads, held constant on exit.
  const arrowLead = arrowRest - (vw + cardLeft - BAR_INSET);

  return (
    <div aria-hidden className="absolute inset-0 z-0 hidden lg:block">
      <svg className="h-full w-full" viewBox={`0 0 ${vw} ${vh}`} fill="none">
        {stripes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            stroke={s.color}
            strokeWidth={BAR_H}
            className={sweeping ? "stripe-flow-exit" : "stripe-flow-enter"}
            style={
              {
                // Dash head at x: offset = snakeLen - (distance to head).
                // -vw rests the tail exactly on the viewport's left edge,
                // where it stays pinned while the exit GROWS the dash.
                strokeDashoffset: -vw,
                strokeDasharray: `${snakeLen} ${dashGap}`,
                "--dash-from": `${cardLeft - vw}px`, // head just off-screen left
                "--dash-rest": `${-vw}px`,
                "--dasharray-rest": `${snakeLen} ${dashGap}`,
                // Piecewise exit stops (globals.css): heads level until the
                // corner, arcs finish together, then level again up the legs.
                "--da-corner": `${snakeLen + runExt} ${dashGap}`,
                "--da-arc": `${snakeLen + runExt + s.arc} ${dashGap}`,
                "--dasharray-exit": `${s.len - vw} ${dashGap}`, // head at path end
              } as React.CSSProperties
            }
          />
        ))}
      </svg>
      {/* The chevron arrow riding ahead of the band. left/top pin the plate's
          pre-offset box to the container origin so the motion path's px
          coordinates line up in every engine. */}
      <div
        className={`absolute left-0 top-0 ${sweeping ? "stripe-arrow-exit" : "stripe-arrow-enter"}`}
        style={
          {
            offsetPath: `path("${arrowD}")`,
            offsetRotate: "auto",
            offsetDistance: `${arrowRest}px`,
            "--arrow-from": `${vw - STRIPE_ARROW_W / 2}px`, // tips at the viewport's left edge
            "--arrow-rest": `${arrowRest}px`,
            // Exit stops share the band's timing; arrowLead keeps the plate a
            // constant distance ahead of the heads through the bend.
            "--arrow-corner": `${vw + cornerX + arrowLead}px`,
            "--arrow-arc": `${vw + cornerX + arc(arrowR) + arrowLead}px`,
            "--arrow-exit": `${flowLen(arrowR)}px`, // path end, above the viewport
          } as React.CSSProperties
        }
      >
        <StripeArrowPlate />
      </div>
    </div>
  );
}
