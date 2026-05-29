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
});
