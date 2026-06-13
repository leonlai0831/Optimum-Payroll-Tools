"use client";

import { useEffect } from "react";
import { IDLE_PING_INTERVAL_MS, IDLE_TIMEOUT_MS } from "@/lib/auth/idle";

/**
 * Client half of the idle auto-logout (policy in lib/auth/idle.ts). Mounted
 * once in the protected (app) layout; renders nothing.
 *
 * - Real activity (pointer/keys/scroll) refreshes the server's `lastSeenAt`
 *   via `POST /api/auth/touch`, throttled to one ping per interval.
 * - After IDLE_TIMEOUT_MS without local activity it asks the server first
 *   (`GET /api/auth/touch`) — a sibling tab the user is active in shares the
 *   session cookie, so its pings keep `remainingMs` positive and this tab
 *   just rescheds instead of killing the shared session.
 * - The visible logout destroys the session and hard-navigates to /login
 *   (full reload clears client state).
 */
export function IdleLogout() {
  useEffect(() => {
    let lastActivity = Date.now();
    let lastPing = 0; // 0 → the first activity pings immediately
    let done = false;

    const redirect = () => {
      if (done) return;
      done = true;
      window.location.assign("/login");
    };

    const logout = async () => {
      if (done) return;
      try {
        await fetch("/api/auth/logout", { method: "POST", keepalive: true });
      } catch {
        // Even unreachable, the server window has lapsed — the cookie is dead.
      }
      redirect();
    };

    const ping = async () => {
      lastPing = Date.now();
      try {
        const res = await fetch("/api/auth/touch", { method: "POST" });
        if (res.status === 401) redirect(); // already expired server-side
      } catch {
        // Network blip: keep working; the next activity retries the ping.
      }
    };

    const onActivity = () => {
      lastActivity = Date.now();
      if (done) return;
      if (lastActivity - lastPing >= IDLE_PING_INTERVAL_MS) void ping();
    };

    const check = async () => {
      if (done || Date.now() - lastActivity < IDLE_TIMEOUT_MS) return;
      try {
        const res = await fetch("/api/auth/touch", { method: "GET" });
        if (res.ok) {
          const body = (await res.json()) as { remainingMs?: number };
          if (typeof body.remainingMs === "number" && body.remainingMs > 0) {
            // Another tab is active — pretend this tab saw that activity.
            lastActivity = Date.now() - (IDLE_TIMEOUT_MS - body.remainingMs);
            return;
          }
        }
        void logout();
      } catch {
        // Can't reach the server to decide — do nothing; the authoritative
        // window expires the session there regardless.
      }
    };

    const events = ["pointerdown", "keydown", "touchstart", "wheel", "scroll", "mousemove"] as const;
    for (const name of events) window.addEventListener(name, onActivity, { passive: true });
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(() => void check(), 30_000);

    return () => {
      for (const name of events) window.removeEventListener(name, onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
