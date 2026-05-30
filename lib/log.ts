/**
 * Minimal structured logger. Emits one JSON object per line to stdout/stderr so
 * platform log collectors (Vercel, Datadog, etc.) can parse the fields — no
 * external service or dependency required.
 *
 * Honors `LOG_LEVEL` (debug | info | warn | error); defaults to "info" in
 * production and "debug" otherwise. `warn`/`error` go to stderr, the rest to
 * stdout. Error values passed in `fields` are expanded to { name, message,
 * stack } so a stack trace survives serialization.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  if (env && env in ORDER) return ORDER[env as LogLevel];
  return process.env.NODE_ENV === "production" ? ORDER.info : ORDER.debug;
}

/** Expand Error values into plain, JSON-safe objects; pass everything else through. */
function expand(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  /** A logger that merges these bindings into every record (e.g. a route name). */
  child(bindings: Record<string, unknown>): Logger;
}

function create(bindings: Record<string, unknown>): Logger {
  function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
    if (ORDER[level] < threshold()) return;
    const record: Record<string, unknown> = { level, time: new Date().toISOString(), msg };
    for (const [key, value] of Object.entries({ ...bindings, ...fields })) {
      record[key] = expand(value);
    }
    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      // A circular or otherwise non-serializable field — never let logging throw.
      line = JSON.stringify({ level, time: record.time, msg });
    }
    (level === "warn" || level === "error" ? console.error : console.log)(line);
  }
  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (b) => create({ ...bindings, ...b }),
  };
}

export const logger: Logger = create({});
