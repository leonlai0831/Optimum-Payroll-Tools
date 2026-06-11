"use client";

import { useSyncExternalStore } from "react";

/**
 * The login page's racing-stripe band, rebuilt as SVG so it can FLOW like the
 * gym deck's rounded-corner artwork instead of only translating. Each stripe
 * is a path — a horizontal run from off-screen left, a concentric quarter-arc
 * (inner stripe tight, outer stripes wider, exactly like the deck corner) just
 * right of the sign-in card, then a vertical leg out the top. The visible bar
 * is a stroke-dash "snake" sliding along that path:
 *
 *   enter:  dash slides in from off-screen left and rests pointing at the card
 *   exit:   the same dash keeps going — under the card, slightly past its
 *           right side, immediately bends upward and leaves through the top
 *
 * The full-height arrowhead rides the band's middle path via CSS motion path
 * (offset-path / offset-rotate:auto), so it leads the band in, lands pointing
 * at the card, and rotates upward through the bend on the way out. Keyframes
 * live in globals.css and read the per-path distances from custom properties
 * set here. Reduced-motion is stilled by the global rule.
 *
 * Geometry mirrors the login layout's Tailwind values — keep in sync:
 *   card: max-w-md (448px), inside max-w-6xl + lg:px-12 → its left edge is
 *         vw - max(31rem, 50vw - 5rem); cluster lifted 4vh (optical center);
 *         band top flush with the card top at 50vh - 13.7rem - 4vh.
 */

const BAR_H = 16; // stripe thickness (was h-4)
const BAR_GAP = 20; // gap between stripes (was gap-5)
const STRIPE_STEP = BAR_H + BAR_GAP; // center-to-center spacing, preserved through the arc
/** Deck order, top to bottom: yellow / blue / yellow / yellow. */
const STRIPE_COLORS = [
  "var(--color-accent)",
  "var(--color-brand)",
  "var(--color-accent)",
  "var(--color-accent)",
];
const CARD_W = 448; // the sign-in card (max-w-md)
const BAND_OFFSET = 219.2; // 13.7rem — band/card top above the centerline
const ARROW_W = 56; // w-14
const ARROW_H = BAR_H * 4 + BAR_GAP * 3; // full band height (124px)
const INNER_R = 64; // innermost corner radius
const LEG_NUDGE = 20; // innermost upward leg this far right of the card edge
const EXIT_Y = -160; // path end above the viewport (arrow fully clears it)
/** Bars stop 3rem short of the card; the arrow covers the last stretch. */
const BAR_INSET = 48;

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
  const cardRight = cardLeft + CARD_W;
  const bandTop = vh / 2 - BAND_OFFSET - 0.04 * vh; // 50% - 13.7rem - 4vh
  // Arc start: the innermost leg lands LEG_NUDGE right of the card, so the
  // bend begins under the card's right edge and surfaces already turning.
  const cornerX = cardRight + LEG_NUDGE - INNER_R;
  // Shared arc center (concentric corner): directly above the top stripe.
  const arcCy = bandTop + BAR_H / 2 - INNER_R;
  const snakeLen = cardLeft - BAR_INSET; // resting bar: viewport left → card

  const flowPath = (y: number, r: number) =>
    // Right along y, quarter-turn up (sweep 0 = the left turn), out the top.
    `M ${-vw} ${y} H ${cornerX} A ${r} ${r} 0 0 0 ${cornerX + r} ${arcCy} V ${EXIT_Y}`;
  const flowLen = (r: number) => cornerX + vw + (Math.PI / 2) * r + (arcCy - EXIT_Y);

  const stripes = STRIPE_COLORS.map((color, i) => {
    const y = bandTop + BAR_H / 2 + i * STRIPE_STEP;
    const r = INNER_R + i * STRIPE_STEP;
    return { color, d: flowPath(y, r), len: flowLen(r) };
  });

  // The arrow rides the band's middle line (between stripes 2 and 3).
  const arrowR = INNER_R + 1.5 * STRIPE_STEP;
  const arrowD = flowPath(bandTop + BAR_H / 2 + 1.5 * STRIPE_STEP, arrowR);
  const arrowRest = vw + cardLeft - ARROW_W / 2; // anchor = center; tip at the card edge

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
                strokeDasharray: `${snakeLen} ${s.len + vw}`,
                // Dash head at x: offset = snakeLen - (distance to head).
                "--dash-from": `${cardLeft - vw}px`, // head just off-screen left
                "--dash-rest": `${-vw}px`, // head at the card's left edge
                "--dash-exit": `${-s.len}px`, // tail past the top of the path
              } as React.CSSProperties
            }
          />
        ))}
      </svg>
      <div
        className={`absolute bg-brand ${sweeping ? "stripe-arrow-exit" : "stripe-arrow-enter"}`}
        style={
          {
            width: ARROW_W,
            height: ARROW_H,
            clipPath: "polygon(0 0, 100% 50%, 0 100%)",
            offsetPath: `path("${arrowD}")`,
            offsetRotate: "auto",
            "--arrow-from": `${vw - ARROW_W / 2}px`, // tip at the viewport's left edge
            "--arrow-rest": `${arrowRest}px`,
            "--arrow-exit": `${flowLen(arrowR)}px`, // path end, above the viewport
          } as React.CSSProperties
        }
      />
    </div>
  );
}
