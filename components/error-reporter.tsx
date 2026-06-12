"use client";

import { useEffect } from "react";

/**
 * Global browser-error capture: uncaught exceptions + unhandled promise
 * rejections are posted to `POST /api/errors` (→ the `app_errors` table →
 * /system/errors). Mounted once in the ROOT layout so the login page is
 * covered too; renders nothing.
 *
 * Defensive by design: each page load reports at most MAX_REPORTS distinct
 * errors and never the same (message, stack-head) twice — an error inside a
 * render loop or interval must not flood the endpoint (the API rate-limits
 * per IP as the backstop). Reporting failures are swallowed; a broken
 * reporter must never break the page.
 */
const MAX_REPORTS = 10;

export function ErrorReporter() {
  useEffect(() => {
    const seen = new Set<string>();

    const report = (message: string, stack?: string | null) => {
      const msg = (message || "Unknown error").slice(0, 2_000);
      const key = `${msg}|${stack?.slice(0, 200) ?? ""}`;
      if (seen.size >= MAX_REPORTS || seen.has(key)) return;
      seen.add(key);
      void fetch("/api/errors", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          stack: stack ?? undefined,
          path: window.location.pathname,
        }),
      }).catch(() => {
        /* never let reporting break the page */
      });
    };

    const onError = (event: ErrorEvent) => {
      report(event.message, event.error instanceof Error ? event.error.stack : null);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason: unknown = event.reason;
      if (reason instanceof Error) {
        report(reason.message, reason.stack);
      } else {
        report(`Unhandled rejection: ${String(reason)}`);
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
