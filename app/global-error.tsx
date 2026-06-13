"use client";

import { useEffect } from "react";

/**
 * Root-layout crash boundary — the last line of defense. It REPLACES the root
 * layout, so it must render its own <html>/<body> and can't rely on the app's
 * stylesheet (hence inline styles). Self-reports to the in-app error log, then
 * offers a reload.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[global] ${error.message || "Fatal render error"}${error.digest ? ` (digest ${error.digest})` : ""}`,
        stack: error.stack ?? null,
        path: typeof window !== "undefined" ? window.location.pathname : null,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#f6f5f4",
          color: "#1f1f1f",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#6b6b6b", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
            The app hit an unexpected error and couldn&rsquo;t recover this view. It&rsquo;s been
            logged for the team.
          </p>
          <button
            type="button"
            // A persistent root crash would re-throw immediately on a soft
            // reset(); a hard reload refetches the document + JS chunks, which is
            // far likelier to recover (e.g. a stale/corrupt cached chunk).
            onClick={() => window.location.reload()}
            style={{
              cursor: "pointer",
              border: "none",
              borderRadius: "9999px",
              padding: "0.6rem 1.4rem",
              fontWeight: 700,
              fontSize: "0.95rem",
              color: "#fff",
              background: "#2f6df6",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
