"use client";

/**
 * The Optimum swimmer mascot as a poseable SVG rig, drawn to match
 * `public/logo-mark.png` (smooth blue swim cap, oval yellow goggles, big
 * pupils, open smile, yellow arms). It peeks over the sign-in card's top edge
 * and reacts to the form:
 *
 *   idle   — resting smile, pupils centered, slow blink
 *   watch  — follows the email being typed (pupils track `look` 0..1)
 *   cover  — password is being typed: hands up over the goggles, "o" mouth
 *   peek   — password revealed: hands drop a touch, eyes peer down over them
 *   cheer  — sign-in success: hands thrown up, beaming
 *   boop   — tapped: wide-eyed "o" surprise (the page alternates it w/ cheer)
 *
 * All posing is CSS transforms transitioned in globals.css (`.mascot-*`), so
 * the global prefers-reduced-motion rule stills every move; the rig's lower
 * edge is meant to sit BEHIND the card, which is where the hands rise from.
 */

export type MascotState = "idle" | "watch" | "cover" | "peek" | "cheer" | "boop";

export function LoginMascot({
  state,
  look = 0.5,
  className,
}: {
  state: MascotState;
  /** Horizontal gaze 0 (left) .. 1 (right); only `watch` uses the full range. */
  look?: number;
  className?: string;
}) {
  const clamped = Math.min(1, Math.max(0, look));
  // Pupils ride inside the lenses: ±4px sideways while watching (any more and
  // they'd clip the glass), glance down when peeking over the hands,
  // dead-center otherwise.
  const px = state === "watch" ? (clamped - 0.5) * 8 : 0;
  const py = state === "watch" ? 1.5 : state === "peek" ? 3.5 : 0;

  return (
    <svg
      viewBox="0 0 120 96"
      className={className}
      data-mascot={state}
      aria-hidden
      focusable="false"
    >
      {/* Cap — the big blue dome, smooth like the logo's (no crest bump). */}
      <path
        d="M 18 76 C 14 38 32 14 60 14 C 88 14 106 38 102 76 Z"
        fill="var(--color-brand)"
      />
      {/* Face — warm white, emerging from under the cap. */}
      <path
        d="M 24 76 C 24 52 38 42 60 42 C 82 42 96 52 96 76 Z"
        fill="#fdf8f0"
      />
      {/* Goggle strap behind the lenses. */}
      <rect x="16" y="50.5" width="88" height="7" rx="3.5" fill="var(--color-accent)" />
      {/* Lenses: the logo's OVAL yellow frames — clearly wider than tall
          (~4:3), with the bridge and strap centered on the lens midline so
          the silhouette doesn't read top-heavy. White glass, big brown
          pupils. */}
      <g className="mascot-eyes">
        <ellipse cx="42" cy="54" rx="16" ry="12" fill="var(--color-accent)" />
        <ellipse cx="78" cy="54" rx="16" ry="12" fill="var(--color-accent)" />
        <rect x="52" y="51" width="16" height="6" rx="3" fill="var(--color-accent)" />
        <ellipse cx="42" cy="54" rx="11.5" ry="7.5" fill="#ffffff" />
        <ellipse cx="78" cy="54" rx="11.5" ry="7.5" fill="#ffffff" />
        <g
          className="mascot-pupils"
          style={{ transform: `translate(${px}px, ${py}px)` }}
        >
          <g className="mascot-blink">
            <circle cx="42" cy="54" r="4.6" fill="#4a3325" />
            <circle cx="78" cy="54" r="4.6" fill="#4a3325" />
            <circle cx="43.6" cy="52.2" r="1.5" fill="#ffffff" />
            <circle cx="79.6" cy="52.2" r="1.5" fill="#ffffff" />
          </g>
        </g>
      </g>
      {/* Mouth: open beaming smile (idle/watch/cheer) vs a small "o" (cover/peek). */}
      <g className="mascot-mouth-smile">
        <path d="M 49 68 Q 60 80 71 68 Q 60 73 49 68 Z" fill="#5b3a29" />
        <path d="M 54 72.5 Q 60 76.5 66 72.5 Q 60 78 54 72.5 Z" fill="#f59e0b" />
      </g>
      <circle className="mascot-mouth-o" cx="60" cy="71" r="4" fill="#5b3a29" />
      {/* Hands — rise from behind the card's edge to cover the goggles; thrown
          up beside the cap on cheer. Yellow like the logo's swim-stroke arm;
          the darker outline keeps them legible over the yellow frames. */}
      <g className="mascot-hand mascot-hand-l">
        <circle cx="42" cy="57" r="10.5" fill="var(--color-accent)" stroke="#d97706" strokeWidth="1.5" />
      </g>
      <g className="mascot-hand mascot-hand-r">
        <circle cx="78" cy="57" r="10.5" fill="var(--color-accent)" stroke="#d97706" strokeWidth="1.5" />
      </g>
    </svg>
  );
}
