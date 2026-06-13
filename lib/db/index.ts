import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { logger } from "@/lib/log";

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
const ALREADY_EXISTS_CODES = new Set(["42P07", "42P06", "42701", "42710"]);

/**
 * True when an error — or anything in its `cause` chain — is a Postgres
 * "already exists" error. Drizzle wraps the driver error, so the SQLSTATE `code`
 * lives on `err.cause`, not on `err` itself; we must walk the chain or the check
 * silently misses it. We match the `code` ONLY (not the message): a message
 * regex is too broad and would silently swallow a genuinely-failed statement
 * whose unrelated message happens to contain "already exists".
 */
function isAlreadyExistsError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur != null && depth < 6; depth++) {
    const e = cur as { code?: unknown; cause?: unknown };
    if (typeof e.code === "string" && ALREADY_EXISTS_CODES.has(e.code)) return true;
    cur = e.cause;
  }
  return false;
}

/**
 * SQLSTATEs that signal a CONCURRENT migration race — two serverless cold-start
 * instances running `migrate()` at the same time. `CREATE SCHEMA IF NOT EXISTS
 * "drizzle"` (and the journal insert) aren't concurrency-safe: both instances
 * pass the existence check, one wins the `pg_namespace` / journal insert and the
 * other errors with unique_violation (23505) or "tuple concurrently updated"
 * (XX000); serialization/deadlock/lock-timeout can also surface under load. All
 * are transient — a sibling is mid-migration — so retrying finds the work done.
 */
const MIGRATION_RACE_CODES = new Set(["23505", "40001", "40P01", "55P03", "XX000"]);

function isMigrationRaceError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur != null && depth < 6; depth++) {
    const e = cur as { code?: unknown; cause?: unknown };
    if (typeof e.code === "string" && MIGRATION_RACE_CODES.has(e.code)) return true;
    cur = e.cause;
  }
  return false;
}

/**
 * SQLSTATEs for "object does not exist" (column/table/object). The mirror of
 * ALREADY_EXISTS_CODES: a DROP/ALTER whose target is already gone is a no-op for
 * reconcileSchema's purpose (make the DB match the migrations), so it's skipped
 * just like an already-existing CREATE — otherwise replaying a `DROP COLUMN`
 * after the column is gone wedges startup.
 */
const DOES_NOT_EXIST_CODES = new Set(["42703", "42P01", "42704"]);

function isDoesNotExistError(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; cur != null && depth < 6; depth++) {
    const e = cur as { code?: unknown; cause?: unknown };
    if (typeof e.code === "string" && DOES_NOT_EXIST_CODES.has(e.code)) return true;
    cur = e.cause;
  }
  return false;
}

/**
 * Re-apply every migration statement individually, skipping only "already
 * exists" (matched by SQLSTATE code). Used when the migration journal is out of
 * sync with a database whose objects were created out-of-band (e.g. via
 * `drizzle-kit push`, or a journal that was lost): the normal journal-based
 * migrate() aborts on the first object that already exists and so never reaches
 * statements that ARE missing (e.g. a newer table from a later migration).
 * Applying statements one at a time creates only what's absent and skips what's
 * present — and every skip is logged so a genuinely-failed statement can't be
 * swallowed unnoticed.
 */
async function reconcileSchema(db: Pick<DB, "execute">): Promise<void> {
  const { readMigrationFiles } = await import("drizzle-orm/migrator");
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  for (const migration of migrations) {
    for (const statement of migration.sql) {
      try {
        await db.execute(sql.raw(statement));
      } catch (err) {
        // Skip both directions of "no change needed": an object that already
        // exists (CREATE/ADD) AND one that's already gone (DROP/ALTER). Anything
        // else is a genuine failure and must surface.
        if (!isAlreadyExistsError(err) && !isDoesNotExistError(err)) throw err;
        logger.warn("reconcileSchema skipped a no-op (object already exists or already gone)", {
          statement,
          err,
        });
      }
    }
  }
}

/**
 * Auto-migrate on first connect so a fresh database needs no manual SQL.
 * Idempotent: drizzle's journal skips applied migrations. If the journal is out
 * of sync (objects exist but aren't recorded), fall back to an idempotent
 * statement-by-statement apply instead of wedging startup on "already exists".
 */
async function migrateOnce(
  db: Pick<DB, "execute">,
  runMigrate: () => Promise<void>,
): Promise<void> {
  try {
    await runMigrate();
  } catch (err) {
    if (!isAlreadyExistsError(err)) throw err;
    await reconcileSchema(db);
  }
}

async function migrateWithFallback(
  db: Pick<DB, "execute">,
  runMigrate: () => Promise<void>,
): Promise<void> {
  // Retry on a concurrent-migration race: another cold-start instance is
  // mid-migration (e.g. racing CREATE SCHEMA "drizzle"). migrate() is idempotent,
  // so by the next attempt the schema + journal exist and it's a no-op. Backs off
  // with jitter; a genuine error (bad URL, no privilege) isn't a race code and so
  // surfaces immediately.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      await migrateOnce(db, runMigrate);
      return;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isMigrationRaceError(err)) throw err;
      logger.warn("migration race — retrying", { attempt, err });
      await new Promise((r) => setTimeout(r, 150 * 2 ** (attempt - 1) + Math.random() * 100));
    }
  }
}

async function init(): Promise<DB> {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false keeps it compatible with transaction-pooled connections (Neon/PgBouncer).
    const client = postgres(url, { prepare: false, max: 5 });
    const db = drizzlePg(client, { schema });
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrateWithFallback(db, () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }));
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
  await migrateWithFallback(db as unknown as DB, () =>
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
  );
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!globalThis.__kpiDb) {
    globalThis.__kpiDb = init().catch((err) => {
      // Don't cache a failed init (e.g. a transient connect error on cold start) —
      // clear it so the next request retries instead of reusing a rejected promise.
      globalThis.__kpiDb = undefined;
      logger.error("database init failed", { err });
      throw err;
    });
  }
  return globalThis.__kpiDb;
}
