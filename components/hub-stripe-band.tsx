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
 *
 * Click "current": at -z-10 the strokes can never win hit-testing (every page
 * box paints above them), so a document-level listener tests the click point
 * against the ribbon's known geometry (legs / arc / runs ± half the bar) and
 * fires a one-shot white glint along each stripe — the login band's toy.
 * Clicks on interactive elements and inside the hero (whose wave + mascot own
 * their own toys) are excluded.
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
/** Click "current" glint: dash length (px of path distance) and run time. */
const PULSE_LEN = 90;
const ZAP_MS = 1400;

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
  // Click "current": each geometric hit bumps the tick; an effect fires the
  // glints. Gated by drawnRef until the draw-in finishes (glints on an
  // undrawn ribbon would float in empty space) — a ref, not state: it only
  // arms the click listener, nothing renders from it.
  const [zap, setZap] = useState(0);
  const drawnRef = useRef(false);

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
    if (!state?.animate) {
      // Resize snaps straight to the finished ribbon — clickable immediately.
      drawnRef.current = state != null;
      return;
    }
    drawnRef.current = false;
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
    box.querySelectorAll<SVGPathElement>("path[data-stripe]").forEach((el, i) => {
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
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        drawnRef.current = true;
      })
      .catch(() => {}); // cancelled (unmount / re-measure) — stays undrawn
    return () => anims.forEach((a) => a.cancel());
  }, [state]);

  // Document-level click → geometric hit test (see the component docblock).
  useEffect(() => {
    if (!state) return;
    const { geom } = state;
    const rMid = INNER_R + 1.5 * STEP;
    const cx = geom.legMidX - rMid;
    const cy = geom.heroMid + rMid;
    const HIT = BAR_H / 2 + 2; // half the bar + a touch of slop
    const onClick = (e: MouseEvent) => {
      if (!drawnRef.current) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("a,button,input,select,textarea,label,[role=button]")) return;
      if (t.closest("#hub-hero")) return; // hero wave + mascot own their toys
      const box = boxRef.current;
      if (!box) return;
      const r0 = box.getBoundingClientRect();
      const x = e.clientX - r0.left;
      const y = e.clientY - r0.top;
      const hit = STRIPE_COLORS.some((_, i) => {
        const r = INNER_R + (3 - i) * STEP;
        // Leg (up the right side), run (out the left), then the bend quadrant.
        if (Math.abs(x - (cx + r)) <= HIT && y >= cy && y <= geom.bottom) return true;
        if (Math.abs(y - (cy - r)) <= HIT && x <= cx && x >= geom.exitX) return true;
        return x >= cx && y <= cy && Math.abs(Math.hypot(x - cx, y - cy) - r) <= HIT;
      });
      if (hit) setZap((n) => n + 1);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [state]);

  // The glints themselves: one white dash per stripe, single run front-to-back
  // along the ribbon (bottom → bend → out the left). WAAPI like the draw-in;
  // reduced-motion skips (the global CSS kill rule can't reach WAAPI).
  useEffect(() => {
    if (!zap || !state) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = boxRef.current;
    if (!box) return;
    const g = buildRibbon(state.geom);
    const anims: Animation[] = [];
    box.querySelectorAll<SVGPathElement>("path[data-pulse]").forEach((el, i) => {
      const s = g.stripes[i];
      if (!s) return;
      anims.push(
        el.animate(
          [
            { strokeDashoffset: `${PULSE_LEN}px`, opacity: 0 },
            { opacity: 0.45, offset: 0.12 },
            { opacity: 0.45, offset: 0.85 },
            { strokeDashoffset: `${-s.len}px`, opacity: 0 },
          ],
          { duration: ZAP_MS, delay: i * 100, easing: "linear" },
        ),
      );
    });
    return () => anims.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fires per click; geometry rides `state`
  }, [zap]);

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
              data-stripe
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
          {/* Click-current glints: one short white dash per stripe, animated
              by the zap effect; invisible (opacity 0) when idle. AFTER the
              stripes so they paint on top of the bars. */}
          {g.stripes.map((s, i) => (
            <path
              key={`pulse-${i}`}
              data-pulse
              d={s.d}
              stroke="#ffffff"
              strokeWidth={BAR_H}
              opacity={0}
              style={{
                // Gap longer than the path so exactly one dash ever shows;
                // resting offset parks the dash entirely before the start.
                strokeDasharray: `${PULSE_LEN} ${s.len + PULSE_LEN * 2}`,
                strokeDashoffset: PULSE_LEN,
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
