# Design notes — visual language & login/launcher interactivity

> Extracted from `CLAUDE.md` (2026-06-14) to keep the main system doc focused on
> high-frequency rules. This is the **low-frequency narrative** behind the look &
> feel and the decorative animation rig — read it when touching the design
> system, the login/launcher chrome, or the racing-stripe / mascot / wave toys.
> `CLAUDE.md` keeps a one-paragraph summary + a pointer here.

## Design language (since the 2026-06 redesign)

Notion-calm base × Optimum CI: warm paper canvas `#f6f5f4`, warm-grey ink ramp
(the Tailwind `gray-*` tokens are remapped — don't re-introduce cool greys),
hairline borders + the layered `.shadow-card` micro-shadow, Nunito 800 headings
with negative tracking, **pill** primary/secondary/danger buttons vs 8px
outline/ghost utility chrome, form fields `text-base` at phone widths (iOS
anti-zoom). The CI guide's footer wave is traced 1:1 into
`components/ci-wave.tsx` (launcher hero + login). Brand skins still come from
`data-brand` CSS variables. Every legacy side-scroll table has been converted to
`MobileCards`/`DesktopTable` — new data views must ship both layouts.

**Racing-stripe system (lg+ only; phones never render it)**: the gym deck's
four-bar motif (yellow/yellow/BLUE/yellow, blue third) runs as SVG dash-snakes
along paths with deck-style concentric corners. Login
(`components/login-stripe-band.tsx`): band enters from the left on the hero's
beat, rests pointing at the sign-in card behind a chevron arrow
(`components/stripe-arrow.tsx`), and on success EXTENDS — under the card, bend
up, out the top — while the screen camera-pans (login drops away,
`ArrivalSlide` descends the launcher). Launcher
(`components/hub-stripe-band.tsx`): a PERMANENT ribbon behind the content
(-z-10) draws itself in on every visit after the loading overlay clears. Both
bands share `stripeLegsMidX` so the cut is continuous, and their runs use the
**Web Animations API** with keyframe offsets computed from real segment lengths
(constant speed through bends — CSS keyframes' static percentages stutter);
reduced-motion is handled explicitly (WAAPI ignores the global CSS kill rule).
The login→launcher handshake lives in `lib/arrival.ts` (sessionStorage; also
stands the loading clip down for that navigation).

**Login interactivity (2026-06)**: a poseable mascot rig
(`components/login-mascot.tsx`, drawn to match `logo-mark.png` — oval yellow
goggles, smooth cap, yellow arms) peeks over the sign-in card — watches the email
being typed (pupils track), covers its goggles during password entry (peeks
when revealed), cheers on success; poses are CSS transitions in globals.css
(`.mascot-*`), stilled by the global reduced-motion rule. The form ships a
password reveal toggle, a Caps Lock hint, failure feedback on three channels
(card shake + `role="alert"` + a short vibration), and a one-tap
`@optimumtrain.page` completion chip (`suggestLoginEmail` in
`lib/auth/email-suggest.ts`, unit-tested; applied on mousedown so the blur
can't eat the tap). While the sign-in request is in flight the stripe band runs
white glints toward the card (`charging` prop, WAAPI with an explicit
reduced-motion skip; the page holds the in-flight state ≥ `MIN_CHARGE_MS`
700ms — warm sign-ins resolve too fast for the glints to register); the footer
wave leans gently with the mouse (lg+ pointers); five quick taps on the card's
logo row send the mascot swimming across the wave (one-shot, unmounts on
animationend). Click toys: tapping the painted wave surges its drift 6× for 2s
(WAAPI `updatePlaybackRate` + a one-shot crest rear-up — shared
`components/splash-wave.tsx`), tapping a stripe bar or the arrow fires a
one-shot glint "current", and tapping the mascot pokes a transient reaction
(alternating "boop" surprise / cheer). To let those clicks reach the
decorative layers, the login content wrapper is `pointer-events-none` with its
two children re-enabled, and the band/wave re-enable hits on their painted
strokes only (containers stay `pointer-events-none`, so empty areas pass
through). **The launcher carries the same toys**: the hero hosts `SplashWave`
plus `components/hero-mascot.tsx` (the rig floating half-submerged in the
hero wave, rendered before it so the crest paints over its lower half), and
the hub ribbon answers clicks with the glint current — but at `-z-10` its
strokes can never win hit-testing, so `hub-stripe-band.tsx` listens on the
document and tests the click point against the ribbon's known geometry
(legs/arc/runs ± half-bar; interactive elements and `#hub-hero` excluded;
held until the draw-in finishes).
