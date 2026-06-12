"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
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
/** Top to bottom: yellow / yellow / BLUE / yellow — blue third, and the
 * upward legs exit in the same left→right order, matching the dashboard
 * ribbon's legs for a continuous cut. */
const STRIPE_COLORS = [
  "var(--color-accent)",
  "var(--color-accent)",
  "var(--color-brand)",
  "var(--color-accent)",
];
const CARD_TOP_OFFSET = 219.2; // 13.7rem — card top above the centerline
const BAND_RAISE = 56; // band floats this far above the card's top edge
const INNER_R = 64; // innermost corner radius
const EXIT_Y = -160; // path end above the viewport (arrow fully clears it)
/** Bars stop this far short of the card; the chevron arrow floats in the gap. */
const BAR_INSET = 110;
const ARROW_TIP_GAP = 18; // resting clearance between the blue tip and the card
const EXIT_MS = 1100;
/** Gentle start whose END slope is 1, handing over to linear seamlessly. */
const EASE_IN_UNIT = "cubic-bezier(0.45, 0, 0.67, 0.67)";

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
const getSize = () => `${window.innerWidth}x${window.innerHeight}`;
const getServerSize = () => "0x0";

/** Length of one charging glint along a stripe (px of path distance). */
const PULSE_LEN = 90;
const PULSE_MS = 1100;

export function LoginStripeBand({
  sweeping,
  charging = false,
}: {
  sweeping: boolean;
  /** Sign-in request in flight: white glints flow along the bars toward the card. */
  charging?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [vw, vh] = useSyncExternalStore(subscribeResize, getSize, getServerSize)
    .split("x")
    .map(Number);

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

  // Exit on the Web Animations API: per-stripe keyframe offsets computed from
  // the REAL segment lengths (run extension / arc / upward leg), so speed is
  // constant through the bend — CSS keyframes' static percentages braked into
  // the corner and lurched out of it. Heads stay level outside the bend; the
  // arrow shares the offsets and keeps its lead.
  useEffect(() => {
    if (!sweeping || vw < 1024) return;
    const box = boxRef.current;
    if (!box) return;
    const legUp = arcCy - EXIT_Y;
    const arcMid = arc(arrowR);
    const travelMid = runExt + arcMid + legUp;
    const p1 = runExt / travelMid;
    const p2 = (runExt + arcMid) / travelMid;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opts: KeyframeAnimationOptions = {
      duration: reduced ? 0 : EXIT_MS,
      easing: "linear",
      fill: "both",
    };
    const anims: Animation[] = [];
    box.querySelectorAll<SVGPathElement>("path[data-stripe]").forEach((el, i) => {
      const s = stripes[i];
      if (!s) return;
      anims.push(
        el.animate(
          [
            { strokeDasharray: `${snakeLen} ${dashGap}`, easing: EASE_IN_UNIT },
            { strokeDasharray: `${snakeLen + runExt} ${dashGap}`, offset: p1 },
            { strokeDasharray: `${snakeLen + runExt + s.arc} ${dashGap}`, offset: p2 },
            { strokeDasharray: `${s.len - vw} ${dashGap}` },
          ],
          opts,
        ),
      );
    });
    const arrowEl = box.querySelector<HTMLElement>("[data-arrow]");
    if (arrowEl) {
      anims.push(
        arrowEl.animate(
          [
            { offsetDistance: `${arrowRest}px`, easing: EASE_IN_UNIT },
            { offsetDistance: `${vw + cornerX + arrowLead}px`, offset: p1 },
            { offsetDistance: `${vw + cornerX + arcMid + arrowLead}px`, offset: p2 },
            // Keep the lead through the FINAL leg too: aim past the path end
            // (clamped there, already off-screen) — ending exactly AT the end
            // would shrink the gap to zero and let the heads catch the plate.
            { offsetDistance: `${flowLen(arrowR) + arrowLead}px` },
          ],
          opts,
        ),
      );
    }
    return () => anims.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry is pure in (vw, vh)
  }, [sweeping]);

  // Charging "current" (sign-in request in flight): a short white glint runs
  // along each stripe from the viewport's left edge into the bar's head at the
  // arrow gap, where it fades out — staggered per stripe so the band reads as
  // energy flowing toward the card. WAAPI like the exit (the global CSS
  // reduced-motion rule can't reach it), so reduced-motion skips it here.
  useEffect(() => {
    if (!charging || sweeping || vw < 1024) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = boxRef.current;
    if (!box) return;
    const anims: Animation[] = [];
    box.querySelectorAll<SVGPathElement>("path[data-pulse]").forEach((el, i) => {
      anims.push(
        el.animate(
          [
            // Dash head distance d = -offset: off-screen left → absorbed at the bar head.
            { strokeDashoffset: -(vw - PULSE_LEN), opacity: 0 },
            { opacity: 0.45, offset: 0.2 },
            { opacity: 0.45, offset: 0.8 },
            { strokeDashoffset: -(vw + snakeLen - PULSE_LEN), opacity: 0 },
          ],
          { duration: PULSE_MS, delay: i * 140, iterations: Infinity, easing: "linear" },
        ),
      );
    });
    return () => anims.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- geometry is pure in (vw, vh)
  }, [charging, sweeping, vw]);

  // The stacked phone layout has no band (and 0x0 covers SSR/first paint).
  if (vw < 1024) return null;

  return (
    <div ref={boxRef} aria-hidden className="absolute inset-0 z-0 hidden lg:block">
      <svg className="h-full w-full" viewBox={`0 0 ${vw} ${vh}`} fill="none">
        {stripes.map((s, i) => (
          <path
            key={i}
            data-stripe
            d={s.d}
            stroke={s.color}
            strokeWidth={BAR_H}
            className="stripe-flow-enter"
            style={
              {
                // Dash head at x: offset = snakeLen - (distance to head).
                // -vw rests the tail exactly on the viewport's left edge,
                // where it stays pinned while the exit GROWS the dash.
                strokeDashoffset: -vw,
                strokeDasharray: `${snakeLen} ${dashGap}`,
                "--dash-from": `${cardLeft - vw}px`, // head just off-screen left
                "--dash-rest": `${-vw}px`,
              } as React.CSSProperties
            }
          />
        ))}
        {/* Charging glints: one short white dash per stripe, animated by the
            charging effect above; invisible (opacity 0) when idle. Rendered
            AFTER the stripes so they paint on top of the bars. */}
        {stripes.map((s, i) => (
          <path
            key={`pulse-${i}`}
            data-pulse
            d={s.d}
            stroke="#ffffff"
            strokeWidth={BAR_H}
            opacity={0}
            style={{
              strokeDasharray: `${PULSE_LEN} ${dashGap}`,
              strokeDashoffset: -(vw - PULSE_LEN),
            }}
          />
        ))}
      </svg>
      {/* The chevron arrow riding ahead of the band. left/top pin the plate's
          pre-offset box to the container origin so the motion path's px
          coordinates line up in every engine. */}
      <div
        data-arrow
        className="stripe-arrow-enter absolute left-0 top-0"
        style={
          {
            offsetPath: `path("${arrowD}")`,
            offsetRotate: "auto",
            offsetDistance: `${arrowRest}px`,
            "--arrow-from": `${vw - STRIPE_ARROW_W / 2}px`, // tips at the viewport's left edge
            "--arrow-rest": `${arrowRest}px`,
          } as React.CSSProperties
        }
      >
        <StripeArrowPlate />
      </div>
    </div>
  );
}
