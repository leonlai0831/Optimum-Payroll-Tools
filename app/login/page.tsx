"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Spinner } from "@/components/ui";
import { CiWave } from "@/components/ci-wave";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.replace("/");
      router.refresh();
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
      {/* Phones stack tagline-over-card; lg+ splits into tagline left, card right. */}
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center gap-10 p-4 pb-32 sm:pb-44 lg:flex-row lg:justify-between lg:gap-16 lg:px-12">
        {/* The staff-side echo of the brand slogan "Optimizing Joy in the Water". */}
        <div className="max-w-xl text-center lg:flex-1 lg:text-left">
          <h1 className="enter-from-top text-5xl font-extrabold leading-[1.08] tracking-[-0.035em] text-brand sm:text-6xl xl:text-7xl">
            Optimizing
            <br className="hidden lg:block" /> Joy at Work
          </h1>
          <p className="enter-from-bottom mt-4 text-lg text-muted sm:text-xl xl:text-2xl">
            Powering the people behind
          </p>
        </div>
        <Card className="relative w-full max-w-md shrink-0 overflow-hidden border-t-4 border-t-brand">
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
              Optimum Payroll Suite
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
            <Button type="submit" className="w-full" disabled={loading || !email || !password}>
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
