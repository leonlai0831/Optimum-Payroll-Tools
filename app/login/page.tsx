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
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      {/* The CI guide's own wave artwork anchors the page bottom (decoration only). */}
      <CiWave className="pointer-events-none absolute inset-x-0 bottom-0 h-28 w-full sm:h-40" />
      {/* The staff-side echo of the brand slogan "Optimizing Joy in the Water". */}
      <div className="relative mb-7 max-w-md text-center">
        <h1 className="text-display text-brand">Optimizing Joy at Work</h1>
        <p className="mt-2 text-sm text-muted">Powering the people behind the joy.</p>
      </div>
      <Card className="relative w-full max-w-sm overflow-hidden border-t-4 border-t-brand">
        <div className="bg-white px-6 pb-4 pt-7 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <Image
              src="/logo-full.png"
              alt="Optimum Swim School"
              width={1080}
              height={350}
              priority
              className="h-8 w-auto"
            />
            <span className="h-5 w-px bg-gray-200" aria-hidden />
            <Image
              src="/logo-fit.png"
              alt="Optimum Fit"
              width={1600}
              height={355}
              priority
              className="h-5 w-auto"
            />
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-500">Optimum Payroll Tools</p>
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
  );
}
