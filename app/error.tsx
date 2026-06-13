"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, ButtonLink, Card } from "@/components/ui";

/**
 * Route-segment error boundary. A render crash anywhere in the app shows this
 * friendly retry page instead of a white screen, and self-reports to the in-app
 * error log (`/api/errors` → `app_errors` + Sentry). This fills a real gap:
 * React render errors are swallowed into the boundary and NEVER reach
 * window.onerror (which `components/error-reporter.tsx` listens on), so without
 * this they'd be invisible. (Server-render errors are also caught by
 * `instrumentation.ts`; a duplicate entry is acceptable.)
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[render] ${error.message || "Render error"}${error.digest ? ` (digest ${error.digest})` : ""}`,
        stack: error.stack ?? null,
        path: typeof window !== "undefined" ? window.location.pathname : null,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <div className="fade-in mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
      <Card className="w-full p-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-h2 text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-body text-muted">
          This page hit an unexpected error. It&rsquo;s been logged for the team. Try again, or head
          back to the home page.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
          <ButtonLink href="/" variant="outline">
            Back to home
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
