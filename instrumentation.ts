import type { Instrumentation } from "next";

/**
 * Next.js server-boot hook (runs once per server instance, in every runtime).
 * `@sentry/node` is Node-only, so the observability module — which pulls it in —
 * is loaded only in the Node runtime, never in the edge runtime that runs
 * proxy.ts / middleware.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initObservability } = await import("./lib/observability");
    await initObservability();

    // Warm the DB connection at server boot so the first real request (usually
    // login) doesn't pay the cold-start cost — establishing the pool + running
    // migrations on the first query can take several seconds on a serverless
    // Postgres. Fire-and-forget: a transient connect failure here must not block
    // the server from becoming ready (getDb() retries on the next call anyway).
    void import("./lib/db")
      .then(({ getDb }) => getDb())
      .catch(() => {
        /* getDb() already logs + clears its cached promise so requests retry */
      });
  }
}

/** Forward unhandled server errors to Sentry (a no-op unless SENTRY_DSN is set). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureRequestError } = await import("./lib/observability");
  captureRequestError(err, request, context);
};
