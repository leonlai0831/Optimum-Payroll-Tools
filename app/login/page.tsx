"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { CiWave } from "@/components/ci-wave";

/** The stripe-band exit (0.8s) must finish inside this before the swap. */
const NAVIGATE_AFTER_MS = 1050;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Validate on submit instead of disabling the button — a solid CTA reads
    // "ready", and the error explains what's missing.
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
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
      // Success flourish first: the racing stripes sweep across the page,
      // then we navigate. Loading stays on so the form can't be re-submitted.
      setSweeping(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, NAVIGATE_AFTER_MS);
    } else {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setError(d.error || "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* The CI guide's own wave artwork anchors the page bottom (decoration only). */}
      <CiWave className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full sm:h-40" />
      {/* Quiet brand anchor in the page's top-left, the way the deck slides
          corner their logo. */}
      <div className="absolute left-5 top-5 z-10 flex items-center gap-2.5 sm:left-8 sm:top-7">
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
      {/* The gym deck's racing-stripe band (lg+): runs from the viewport's left
          edge to the card's left side, led by a full-height arrowhead that
          lands pointing at the card. Top stays flush with the card's top edge
          (card ~27.4rem tall, centered, the whole cluster optically lifted
          4vh). Enters from the left as one unit on the headline's beat; exits
          right on success. right-[max(...)] = the card's left edge whether the
          max-w-6xl container is viewport-bound or max-width-bound. */}
      <div
        aria-hidden
        className={`absolute left-0 right-[max(31rem,calc(50%-5rem))] top-[calc(50%-13.7rem-4vh)] z-0 hidden lg:block ${
          sweeping ? "stripe-band-exit" : "stripe-band-enter"
        }`}
      >
        <div className="flex flex-col gap-5 pr-12">
          <span className="h-4 bg-accent" />
          <span className="h-4 bg-brand" />
          <span className="h-4 bg-accent" />
          <span className="h-4 bg-accent" />
        </div>
        {/* The arrowhead riding the band's leading edge (overlaps the bars by
            0.5rem so shaft and head read as one arrow). */}
        <span
          className="absolute inset-y-0 right-0 w-14 bg-brand"
          style={{ clipPath: "polygon(0 0, 100% 50%, 0 100%)" }}
        />
      </div>
      {/* Phones stack tagline-over-card; lg+ splits into tagline left, card
          right — the whole cluster sits slightly above geometric center
          (optical center) so tall screens don't read bottom-heavy. */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-10 p-4 pb-32 sm:pb-44 lg:flex-row lg:-translate-y-[4vh] lg:justify-between lg:gap-16 lg:px-12">
        {/* The staff-side echo of the brand slogan "Optimizing Joy in the Water".
            Nudged down on lg so it sits clear below the stripe band above it. */}
        <div className="max-w-xl text-center lg:mt-20 lg:flex-1 lg:text-left">
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
        <Card className="enter-from-bottom relative w-full max-w-md shrink-0 overflow-hidden border-t-4 border-t-brand">
          <div className="bg-white px-6 pb-5 pt-8 text-center">
            <div className="flex items-center justify-center gap-3">
              <Image
                src="/logo-full.png"
                alt="Optimum Swim School"
                width={1080}
                height={350}
                priority
                className="h-16 w-auto"
              />
              <span className="h-8 w-px bg-gray-200" aria-hidden />
              <Image
                src="/logo-fit.png"
                alt="Optimum Fit"
                width={1600}
                height={355}
                priority
                className="h-7 w-auto"
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
              <Input
                id="email"
                type="email"
                autoFocus
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@optimumtrain.page"
              />
            </div>
            <div>
              <label htmlFor="pw" className="mb-1 block text-sm font-medium text-gray-700">
                Password
              </label>
              <Input
                id="pw"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
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
              <a href="/setup" className="font-medium text-gray-500 hover:text-brand hover:underline">
                Check setup status
              </a>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
