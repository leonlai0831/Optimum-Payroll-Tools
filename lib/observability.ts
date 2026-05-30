import type * as SentryNode from "@sentry/node";
import { logger, setErrorSink } from "./log";

type SentryModule = typeof SentryNode;

let sentry: SentryModule | null = null;
let started = false;

/**
 * Initialize Sentry error monitoring from `SENTRY_DSN`. A graceful no-op when the
 * DSN is unset — mirroring how the app degrades without `ANTHROPIC_API_KEY`.
 *
 * `@sentry/node` is not edge-safe, so this must run in the Node runtime only;
 * the caller in `instrumentation.ts` guards on `NEXT_RUNTIME`. Once initialized,
 * every `logger.error` is forwarded to Sentry automatically via the log sink.
 */
export async function initObservability(): Promise<void> {
  if (started) return; // idempotent — register() runs once, but be safe
  started = true;

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = (await import("@sentry/node")) as SentryModule;
    Sentry.init({
      dsn,
      environment:
        process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0") || 0,
    });
    sentry = Sentry;
    setErrorSink(forwardLog);
    logger.info("sentry error monitoring enabled");
  } catch (err) {
    logger.warn("sentry init failed; continuing without error monitoring", { err });
  }
}

/** Sink adapter: turn an error-level log into a Sentry exception or message. */
function forwardLog(msg: string, fields?: Record<string, unknown>): void {
  if (!sentry) return;
  const cause = fields?.err ?? fields?.error;
  try {
    if (cause instanceof Error) {
      sentry.captureException(cause, { extra: { msg, ...fields } });
    } else {
      sentry.captureMessage(msg, { level: "error", extra: fields });
    }
  } catch {
    /* never let reporting throw */
  }
}

/** Explicitly report an error. Safe no-op when Sentry isn't configured. */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentry) return;
  try {
    sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* never let reporting throw */
  }
}

/** Adapter for Next's `onRequestError` instrumentation hook. */
export function captureRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string },
): void {
  captureException(error, {
    path: request?.path,
    method: request?.method,
    routePath: context?.routePath,
    routeType: context?.routeType,
  });
}

export function isObservabilityEnabled(): boolean {
  return sentry !== null;
}
