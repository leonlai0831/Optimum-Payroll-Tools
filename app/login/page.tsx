"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Waves } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
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
      body: JSON.stringify({ password }),
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
      <Card className="w-full max-w-sm overflow-hidden">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-center text-white">
          <Waves className="mx-auto mb-2 h-8 w-8" />
          <h1 className="text-lg font-bold">Optimum Swim School</h1>
          <p className="text-sm text-indigo-100">KPI &amp; Bonus Dashboard</p>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <div>
            <label htmlFor="pw" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <Input
              id="pw"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter shared password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !password}>
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
