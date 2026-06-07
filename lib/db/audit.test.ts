import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite (no POSTGRES_URL, no on-disk dev DB) — same as db.test.ts.
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URL;

describe("audit log queries (PGlite in-memory)", () => {
  let queries: typeof import("./queries");

  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("records entries and lists them newest-first", async () => {
    await queries.recordAudit({
      actorId: 1,
      actorEmail: "admin@local",
      action: "user.create",
      entity: "user",
      entityId: 7,
      summary: "Created user a@b (staff)",
    });
    await queries.recordAudit({
      actorId: 1,
      actorEmail: "admin@local",
      action: "settings.update",
      entity: "config",
      summary: "Updated KPI scoring settings",
    });

    const entries = await queries.listAuditLog();
    expect(entries.length).toBe(2);
    // Newest first.
    expect(entries[0].action).toBe("settings.update");
    expect(entries[1].action).toBe("user.create");
    // entityId is stored as text; null when omitted.
    expect(entries[1].entityId).toBe("7");
    expect(entries[0].entityId).toBeNull();
  });

  it("respects the limit argument", async () => {
    const one = await queries.listAuditLog(1);
    expect(one.length).toBe(1);
    expect(one[0].action).toBe("settings.update");
  });

  it("getAllowanceSavers maps each allowance run to its last saver (email fallback)", async () => {
    await queries.recordAudit({
      actorId: 2,
      actorEmail: "m1@opt.page",
      action: "allowance.save",
      entity: "allowance_run",
      entityId: 10,
      summary: "Saved allowance for X",
    });
    await queries.recordAudit({
      actorId: 3,
      actorEmail: "m2@opt.page",
      action: "allowance.save",
      entity: "allowance_run",
      entityId: 11,
      summary: "Saved allowance for Y",
    });
    // A later save of run 10 by a second manager — latest wins.
    await queries.recordAudit({
      actorId: 4,
      actorEmail: "m3@opt.page",
      action: "allowance.save",
      entity: "allowance_run",
      entityId: 10,
      summary: "Edited allowance for X",
    });

    const savers = await queries.getAllowanceSavers();
    expect(savers[10]).toBe("m3@opt.page"); // last editor, not the first
    expect(savers[11]).toBe("m2@opt.page");
    // Non-allowance audit rows (e.g. the user.create above) are excluded.
    expect(savers[7]).toBeUndefined();
  });

  it("resolves savers to the actor's display name when set, for allowance + KPI", async () => {
    const u = await queries.createUser({
      email: "named@opt.page",
      password: "pw",
      role: "admin",
      displayName: "Coach Mandy",
    });
    await queries.recordAudit({
      actorId: u.id,
      actorEmail: "named@opt.page",
      action: "allowance.save",
      entity: "allowance_run",
      entityId: 20,
      summary: "Saved allowance",
    });
    await queries.recordAudit({
      actorId: u.id,
      actorEmail: "named@opt.page",
      action: "kpi_run.save",
      entity: "run",
      entityId: 30,
      summary: "Saved KPI run",
    });
    expect((await queries.getAllowanceSavers())[20]).toBe("Coach Mandy");
    expect((await queries.getKpiRunSavers())[30]).toBe("Coach Mandy");
    // An actor with no matching user row still falls back to the snapshot email.
    expect((await queries.getAllowanceSavers())[10]).toBe("m3@opt.page");
  });
});
