"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Spinner } from "@/components/ui";

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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm overflow-hidden border-t-4 border-t-brand">
        <div className="bg-white px-6 pb-4 pt-7 text-center">
          {loading ? (
            <video
              className="mx-auto h-auto w-36"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-label="Signing in…"
            >
              <source src="/logo-animation.mp4" type="video/mp4" />
            </video>
          ) : (
            <Image
              src="/logo.png"
              alt="Optimum Swim School"
              width={560}
              height={433}
              priority
              className="mx-auto h-auto w-36"
            />
          )}
          <p className="mt-3 text-sm font-semibold text-gray-500">
            {loading ? "Signing in…" : "Optimum Payroll Tools"}
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
        </form>
      </Card>
    </div>
  );
}
