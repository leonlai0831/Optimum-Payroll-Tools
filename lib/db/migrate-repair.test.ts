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

/**
 * Cold-start connection storms (many serverless instances waking a scaled-to-zero
 * compute at once) make migrate()'s FIRST statement — CREATE SCHEMA "drizzle" —
 * fail transiently. migrateWithFallback must retry those (like a migration race)
 * so the app self-heals instead of logging "database init failed", but must still
 * surface a genuine misconfig (bad URL / no privilege) immediately.
 */
describe("migrateWithFallback retries transient cold-start connection failures", () => {
  // execute() is never reached: these errors aren't "already exists", so
  // migrateOnce rethrows before reconcileSchema would run.
  const fakeDb = {
    execute: async () => {
      throw new Error("reconcileSchema should not run for a connection error");
    },
  } as unknown as DB;

  function pgError(code: string): Error {
    const err = new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"');
    (err as { cause?: unknown }).cause = { code, message: `simulated ${code}` };
    return err;
  }

  it("retries a connection-limit error (53300) then succeeds", async () => {
    const { migrateWithFallback } = await import("./index");
    let calls = 0;
    await migrateWithFallback(fakeDb, async () => {
      calls++;
      if (calls < 3) throw pgError("53300");
    });
    expect(calls).toBe(3);
  });

  it("retries a Neon-waking error (57P03) and a socket reset (ECONNRESET)", async () => {
    const { migrateWithFallback } = await import("./index");
    for (const code of ["57P03", "ECONNRESET"]) {
      let calls = 0;
      await migrateWithFallback(fakeDb, async () => {
        calls++;
        if (calls < 2) throw pgError(code);
      });
      expect(calls, code).toBe(2);
    }
  });

  it("does NOT retry a permanent error (permission denied 42501)", async () => {
    const { migrateWithFallback } = await import("./index");
    let calls = 0;
    await expect(
      migrateWithFallback(fakeDb, async () => {
        calls++;
        throw pgError("42501");
      }),
    ).rejects.toThrow("Failed query");
    expect(calls).toBe(1);
  });
});
