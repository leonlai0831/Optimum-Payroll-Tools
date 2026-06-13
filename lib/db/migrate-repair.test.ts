import { describe, expect, it } from "vitest";
import type { DB } from "./index";

// In-memory PGlite (no POSTGRES_URL, no on-disk dev DB).
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;

const FOLDER = "lib/db/migrations";

/**
 * Reproduces the production state where the DB objects all exist but drizzle's
 * journal is empty (a db:push-bootstrapped database): migrate() re-attempts
 * migration 0000, hits "already exists", and falls back to reconcileSchema. We
 * assert the fallback (a) doesn't wedge startup and (b) backfills the journal so
 * the NEXT migrate() is a clean no-op — no perpetual per-cold-start reconcile.
 */
describe("migration journal repair (out-of-sync DB)", () => {
  it("reconciles, backfills the journal, and makes the next migrate() a clean no-op", async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const { migrateWithFallback } = await import("./index");
    const schema = await import("./schema");

    const client = new PGlite();
    const db = drizzle(client, { schema });

    // 1. Clean migrate → every object + a populated journal.
    await migrate(db, { migrationsFolder: FOLDER });

    // 2. Wipe the journal but keep the objects — the prod out-of-sync state.
    await client.query('DELETE FROM "drizzle"."__drizzle_migrations"');
    const before = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"',
    );
    expect(before.rows[0].n).toBe(0);

    // 3. The fallback must not throw (all CREATEs already exist → skipped) and
    //    must backfill the journal.
    await migrateWithFallback(db as unknown as DB, () => migrate(db, { migrationsFolder: FOLDER }));
    const after = await client.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"',
    );
    expect(after.rows[0].n).toBeGreaterThan(0);

    // 4. Journal repaired → a fresh migrate() applies nothing and doesn't throw.
    await migrate(db, { migrationsFolder: FOLDER });
  });
});
