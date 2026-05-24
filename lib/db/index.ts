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

async function init(): Promise<DB> {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    // prepare:false keeps it compatible with transaction-pooled connections (Neon/PgBouncer).
    const client = postgres(url, { prepare: false, max: 5 });
    return drizzlePg(client, { schema });
  }

  // Local fallback: in-process Postgres, persisted to ./.pglite so saved months survive restarts.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_PATH ?? ".pglite");
  const db = drizzlePglite(client, { schema });
  await migrate(db, { migrationsFolder: "lib/db/migrations" });
  return db as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!globalThis.__kpiDb) globalThis.__kpiDb = init();
  return globalThis.__kpiDb;
}
