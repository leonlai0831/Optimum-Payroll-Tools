import { beforeAll, describe, expect, it } from "vitest";

// In-memory PGlite (no POSTGRES_URL, no on-disk dev DB) — same as db.test.ts.
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URL;

describe("app error queries (PGlite in-memory)", () => {
  let queries: typeof import("./queries");

  beforeAll(async () => {
    queries = await import("./queries");
  });

  it("records server + client errors and lists them newest-first", async () => {
    await queries.recordAppError({
      source: "server",
      message: "boom on save",
      stack: "Error: boom on save\n  at save()",
      path: "POST /api/runs",
    });
    await queries.recordAppError({
      source: "client",
      message: "TypeError: x is undefined",
      path: "/freelancer",
      userId: 7,
      userEmail: "coach@opt.page",
      userAgent: "Mozilla/5.0",
    });

    const entries = await queries.listAppErrors();
    expect(entries.length).toBe(2);
    expect(entries[0].source).toBe("client"); // newest first
    expect(entries[0].userEmail).toBe("coach@opt.page");
    expect(entries[1].source).toBe("server");
    expect(entries[1].stack).toContain("at save()");
    // Defaults for the unattributed server row.
    expect(entries[1].userId).toBeNull();
    expect(entries[1].userEmail).toBe("");
  });

  it("caps pathological field lengths", async () => {
    await queries.recordAppError({
      source: "client",
      message: "m".repeat(10_000),
      stack: "s".repeat(20_000),
      path: "/p".repeat(1_000),
    });
    const [latest] = await queries.listAppErrors(1);
    expect(latest.message.length).toBe(2_000);
    expect(latest.stack!.length).toBe(8_000);
    expect(latest.path!.length).toBe(500);
  });

  it("never throws, even with a broken insert", async () => {
    // A message that's not a string would make .slice blow up inside; the
    // recorder must swallow it (it runs inside the error-log sink).
    await expect(
      queries.recordAppError({ message: 123 as unknown as string, source: "server" }),
    ).resolves.toBeUndefined();
  });

  it("clearAppErrors wipes the list", async () => {
    expect((await queries.listAppErrors()).length).toBeGreaterThan(0);
    await queries.clearAppErrors();
    expect((await queries.listAppErrors()).length).toBe(0);
  });
});
