import type * as SentryNode from "@sentry/node";
import { logger, setErrorSink } from "./log";

type SentryModule = typeof SentryNode;

let sentry: SentryModule | null = null;
let started = false;

/**
 * Initialize error tracking. Two layers, both wired through the error-level
 * log sink so every `logger.error` (and `onRequestError`) is captured:
 *
 * - **In-app error log** (`app_errors` table → `/system/errors`): always on —
 *   no external account or env var needed.
 * - **Sentry** from `SENTRY_DSN`: a graceful no-op when the DSN is unset,
 *   mirroring how the app degrades without `ANTHROPIC_API_KEY`.
 *
 * `@sentry/node` is not edge-safe, so this must run in the Node runtime only;
 * the caller in `instrumentation.ts` guards on `NEXT_RUNTIME`.
 */
export async function initObservability(): Promise<void> {
  if (started) return; // idempotent — register() runs once, but be safe
  started = true;

  setErrorSink(forwardLog);

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
    logger.info("sentry error monitoring enabled");
  } catch (err) {
    logger.warn("sentry init failed; continuing without error monitoring", { err });
  }
}

/**
 * Write one error to the in-app log. Fire-and-forget; `recordAppError`
 * swallows its own failures (it must — a DB outage makes `recordAudit` etc.
 * log at error level, which lands right back here through the sink).
 */
function recordToErrorLog(entry: {
  message: string;
  stack?: string | null;
  path?: string | null;
}): void {
  void import("@/lib/db/queries")
    .then(({ recordAppError }) => recordAppError({ source: "server", ...entry }))
    .catch(() => {
      /* never let reporting throw or log */
    });
}

/**
 * Serialize an Error for the in-app error log INCLUDING its `cause` chain. The
 * Postgres SQLSTATE / driver code lives on `err.cause` (drizzle wraps the driver
 * error), so without walking the chain the stored stack shows only the opaque
 * wrapper — e.g. `Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"` with no
 * code, which is undiagnosable. Each cause is appended as `Caused by: [code: …]
 * <message>`. Depth-capped like the DB error walkers. Exported for unit-locking.
 */
export function serializeError(err: Error): { message: string; stack: string | null } {
  const chain: string[] = [];
  let cur: unknown = (err as { cause?: unknown }).cause;
  for (let depth = 0; cur != null && depth < 6; depth++) {
    const e = cur as { message?: unknown; code?: unknown; cause?: unknown };
    const code =
      typeof e.code === "string" || typeof e.code === "number" ? ` [code: ${e.code}]` : "";
    const message =
      e instanceof Error ? e.message : typeof e.message === "string" ? e.message : String(cur);
    chain.push(`Caused by:${code} ${message}`);
    cur = e.cause;
  }
  const stack = (err.stack ?? "") + (chain.length ? `\n${chain.join("\n")}` : "");
  return { message: err.message, stack: stack || null };
}

/** Sink for error-level logs: in-app error log always, Sentry when configured. */
function forwardLog(msg: string, fields?: Record<string, unknown>): void {
  const cause = fields?.err ?? fields?.error;
  if (cause instanceof Error) {
    const { message, stack } = serializeError(cause);
    recordToErrorLog({ message: `${msg}: ${message}`, stack });
  } else {
    recordToErrorLog({ message: msg, stack: null });
  }
  if (!sentry) return;
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
  const err = error instanceof Error ? error : null;
  const serialized = err ? serializeError(err) : { message: String(error), stack: null };
  recordToErrorLog({
    message: serialized.message,
    stack: serialized.stack,
    path: [request?.method, request?.path ?? context?.routePath].filter(Boolean).join(" ") || null,
  });
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
