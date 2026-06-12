"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { CiWave } from "@/components/ci-wave";
import { LoginMascot, type MascotState } from "@/components/login-mascot";
import { LoginStripeBand } from "@/components/login-stripe-band";
import { suggestLoginEmail } from "@/lib/auth/email-suggest";
import { markArrival } from "@/lib/arrival";
import { cn } from "@/lib/utils";

/** The stripe-band exit (1.1s: under the card, around the bend, out the top)
 * plus the screen drop chasing it (1.05s delay + 0.55s) must finish inside
 * this before the swap. */
const NAVIGATE_AFTER_MS = 1650;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [swimming, setSwimming] = useState(false);
  // Easter egg: five quick taps on the card's logo row → mascot swims the wave.
  const logoTaps = useRef({ n: 0, t: 0 });
  const waveRef = useRef<HTMLDivElement | null>(null);

  const suggestion = suggestLoginEmail(email);

  // The mascot mirrors the form: it watches the email being typed, covers its
  // goggles while a password goes in (peeks when revealed), cheers on success.
  const mascot: MascotState = sweeping
    ? "cheer"
    : pwFocused
      ? showPw
        ? "peek"
        : "cover"
      : emailFocused
        ? "watch"
        : "idle";
  const look = Math.min(1, email.length / 24);

  function failFeedback(message: string) {
    setError(message);
    // Multi-channel: shake for sighted users, role="alert" for screen readers,
    // a short double-buzz where vibration exists (phones).
    setShaking(true);
    if (typeof navigator !== "undefined") navigator.vibrate?.([60, 50, 60]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Validate on submit instead of disabling the button — a solid CTA reads
    // "ready", and the error explains what's missing.
    if (!email.trim() || !password) {
      failFeedback("Enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // Success flourish first: the stripes run out the top, THEN we
      // navigate — the dashboard picks the sequence up via the arrival mark
      // (its permanent ribbon draws itself in). Loading stays on so the form
      // can't be re-submitted.
      markArrival();
      setSweeping(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, NAVIGATE_AFTER_MS);
    } else {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      failFeedback(d.error || "Login failed");
      setLoading(false);
    }
  }

  /** Caps Lock state rides every key event on the password field. */
  function trackCaps(e: React.KeyboardEvent<HTMLInputElement>) {
    setCapsOn(e.getModifierState?.("CapsLock") ?? false);
  }

  function onLogoTap() {
    const now = Date.now();
    logoTaps.current =
      now - logoTaps.current.t < 1500
        ? { n: logoTaps.current.n + 1, t: now }
        : { n: 1, t: now };
    if (logoTaps.current.n >= 5) {
      logoTaps.current = { n: 0, t: 0 };
      setSwimming(true);
    }
  }

  /** Wave parallax: the footer wave leans gently with the mouse (lg+ pointers
   * only; touch never fires `mouse`). Writes the transform directly — no
   * re-render — and the wrapper's transition smooths it. Skipped under
   * reduced motion (the transition would be killed, leaving raw jumps). */
  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const el = waveRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const dx = (e.clientX / window.innerWidth - 0.5) * 18;
    el.style.transform = `translateX(${dx.toFixed(1)}px)`;
  }

  return (
    // On success the whole screen (band included) drops away downward chasing
    // the departing arrow — the camera pans up; the dashboard then descends
    // into place from above (components/arrival-slide.tsx).
    <div
      className={`relative min-h-screen overflow-hidden ${sweeping ? "screen-exit-down" : ""}`}
      onPointerMove={onPointerMove}
    >
      {/* The CI guide's own wave artwork anchors the page bottom (decoration
          only); the wrapper carries the pointer parallax. */}
      <div
        ref={waveRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 transition-transform duration-700 ease-out will-change-transform"
      >
        <CiWave className="block h-28 w-full sm:h-40" />
      </div>
      {/* Easter egg: the mascot front-crawls the width of the wave, then is
          unmounted when the crossing animation ends (the bob inside never
          ends, so filter to the outer element's own animation). */}
      {swimming && (
        <div
          className="login-swimmer pointer-events-none absolute bottom-16 left-0 z-10 sm:bottom-24"
          aria-hidden
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setSwimming(false);
          }}
        >
          <div className="login-swimmer-bob">
            <LoginMascot state="cheer" className="h-12 w-auto sm:h-14" />
          </div>
        </div>
      )}
      {/* Quiet brand anchor in the page's top-left, the way the deck slides
          corner their logo. */}
      <div className="absolute left-5 top-5 z-10 hidden items-center gap-2.5 sm:left-8 sm:top-7 lg:flex">
        <Image
          src="/logo-full.png"
          alt="Optimum Swim School"
          width={1080}
          height={350}
          className="h-7 w-auto sm:h-8"
        />
        <span className="h-5 w-px bg-gray-200" aria-hidden />
        <Image
          src="/logo-fit.png"
          alt="Optimum Fit"
          width={1600}
          height={355}
          className="h-4 w-auto sm:h-5"
        />
      </div>
      {/* The gym deck's racing-stripe band (lg+), arrow-led. While the sign-in
          request is in flight it carries flowing glints toward the card; on
          success the same band flows onward: under the card, slightly past
          its right side, a deck-style concentric bend upward, out the top —
          THEN the router swaps to the dashboard. */}
      <LoginStripeBand sweeping={sweeping} charging={loading && !sweeping} />
      {/* Phones stack tagline-over-card; lg+ splits into tagline left, card
          right — the whole cluster sits slightly above geometric center
          (optical center) so tall screens don't read bottom-heavy. */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-10 px-4 py-10 pb-32 sm:pb-44 lg:flex-row lg:-translate-y-[4vh] lg:justify-between lg:gap-16 lg:px-12">
        {/* The staff-side echo of the brand slogan "Optimizing Joy in the Water".
            Pushed well down on lg so it sits clear below the stripe band; the
            inner inline-block shrink-wraps to the headline so both headline
            lines AND the support line center on the same axis. */}
        <div className="max-w-xl text-center lg:mt-32 lg:flex-1 lg:text-left">
          <div className="inline-block text-center">
            <h1 className="enter-from-top text-5xl font-extrabold leading-[1.08] tracking-[-0.035em] text-brand sm:text-6xl xl:text-7xl">
              Optimizing
              <br className="hidden lg:block" />{" "}
              <span className="relative inline-block">
                Joy at Work
                {/* Accent swash tying the headline to the stripes' yellow. */}
                <svg
                  className="absolute -bottom-2 left-0 h-3 w-full sm:-bottom-3 sm:h-4"
                  viewBox="0 0 300 14"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <path
                    d="M4 10 Q 150 -4 296 8"
                    stroke="var(--color-accent)"
                    strokeWidth="7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="enter-from-bottom mt-6 text-lg text-gray-600 sm:text-xl xl:text-2xl">
              Powering the people behind
            </p>
          </div>
        </div>
        {/* The entrance animation lives on this wrapper (not the Card) so the
            error shake can come and go on the Card without restarting it; the
            mascot sits behind the Card and peeks over its top edge. */}
        <div className="enter-from-bottom relative w-full max-w-md shrink-0">
          {/* w-24 → the 120×96 rig renders 96×76.8px; -top-16 leaves svg-y 0–80
              above the card edge (cap, goggles, full smile) and hides the
              chin + resting hands behind the card, where the hands rise from. */}
          <div className="pointer-events-none absolute -top-16 right-8 w-24 select-none" aria-hidden>
            <LoginMascot state={mascot} look={look} className="h-auto w-full" />
          </div>
          <Card
            className={cn(
              "relative w-full overflow-hidden border-t-4 border-t-brand",
              shaking && "login-shake",
            )}
            onAnimationEnd={() => setShaking(false)}
          >
            <div className="bg-white px-6 pb-5 pt-8 text-center" onClick={onLogoTap}>
              <div className="flex items-center justify-center gap-2.5 sm:gap-3">
                <Image
                  src="/logo-full.png"
                  alt="Optimum Swim School"
                  width={1080}
                  height={350}
                  priority
                  className="h-12 w-auto sm:h-16"
                />
                <span className="h-6 w-px bg-gray-200 sm:h-8" aria-hidden />
                <Image
                  src="/logo-fit.png"
                  alt="Optimum Fit"
                  width={1600}
                  height={355}
                  priority
                  className="h-5 w-auto sm:h-7"
                />
              </div>
              <p className="mt-4 text-2xl font-extrabold tracking-tight text-gray-900">
                Optimum People Hub
              </p>
            </div>
            <form onSubmit={submit} className="space-y-4 p-6">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <div className="relative">
                  <Input
                    id="email"
                    type="email"
                    autoFocus
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    placeholder="you@optimumtrain.page"
                  />
                  {/* One-tap domain completion. mousedown (not click) applies it
                      BEFORE the input would blur, so the chip can't vanish
                      under the pointer mid-tap. */}
                  {emailFocused && suggestion && (
                    <button
                      type="button"
                      className="fade-in absolute left-0 top-full z-10 mt-1.5 min-h-11 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 shadow-card hover:border-brand hover:text-brand"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setEmail(suggestion);
                      }}
                    >
                      {suggestion}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="pw" className="mb-1 block text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="pw"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={trackCaps}
                    onKeyUp={trackCaps}
                    onFocus={() => setPwFocused(true)}
                    onBlur={() => {
                      setPwFocused(false);
                      setCapsOn(false);
                    }}
                    aria-describedby={capsOn ? "caps-hint" : undefined}
                    placeholder="Enter your password"
                    className="pr-11"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    title={showPw ? "Hide password" : "Show password"}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {capsOn && (
                  <p id="caps-hint" className="mt-1 text-xs font-medium text-amber-600">
                    Caps Lock is on.
                  </p>
                )}
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Spinner /> Signing in…
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
              <p className="text-center text-xs text-gray-400">
                Trouble signing in?{" "}
                <a
                  href="https://wa.me/60143611383"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-gray-500 hover:text-brand hover:underline"
                >
                  Please contact support here
                </a>
              </p>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
