import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Single DB type used across the app. In production we connect to Postgres
 * (Vercel Postgres / Neon) via postgres-js. With no POSTGRES_URL (local dev or
 * preview), we fall back to in-process PGlite so the app is fully runnable
 * without a cloud database. PGlite is cast to the same type — their query APIs
 * are compatible for our usage.
 */
export type DB = PostgresJsDatabase<typeof schema>;

declare global {
  var __kpiDb: Promise<DB> | undefined;
}

const MIGRATIONS_FOLDER = "lib/db/migrations";

/** SQLSTATE codes for "object already exists" (table/schema/column/constraint). */
function isAlreadyExistsError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code && ["42P07", "42P06", "42701", "42710"].includes(code)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /already exists/i.test(msg);
}

async function init(): Promise<DB> {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false keeps it compatible with transaction-pooled connections (Neon/PgBouncer).
    const client = postgres(url, { prepare: false, max: 5 });
    const db = drizzlePg(client, { schema });
    // Auto-create tables on first connect so a fresh database needs no manual SQL.
    // Idempotent: drizzle's journal skips applied migrations; we swallow
    // "already exists" so tables created out-of-band (before the journal) don't wedge startup.
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    try {
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    } catch (err) {
      if (!isAlreadyExistsError(err)) throw err;
    }
    return db;
  }

  // Serverless filesystems are read-only, so PGlite can't create its data dir there.
  // Fail with an actionable message instead of a cryptic "EROFS: mkdir '.pglite'".
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error(
      "No POSTGRES_URL/DATABASE_URL set. Attach a Postgres database and expose its " +
        "connection string to this environment (Production AND Preview), then redeploy. " +
        "The PGlite fallback only works on a writable local filesystem.",
    );
  }

  // Local fallback: in-process Postgres, persisted to ./.pglite so saved months survive restarts.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_PATH ?? ".pglite");
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!globalThis.__kpiDb) {
    globalThis.__kpiDb = init().catch((err) => {
      // Don't cache a failed init (e.g. a transient connect error on cold start) —
      // clear it so the next request retries instead of reusing a rejected promise.
      globalThis.__kpiDb = undefined;
      throw err;
    });
  }
  return globalThis.__kpiDb;
}
