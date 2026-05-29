import { describe, expect, it } from "vitest";
import { overallStatus, type HealthCheck } from "./health";

// In-memory PGlite (no POSTGRES_URL, no on-disk dev DB) — same as db.test.ts.
process.env.PGLITE_PATH = "memory://";
delete process.env.POSTGRES_URL;
delete process.env.DATABASE_URL;

function check(partial: Partial<HealthCheck>): HealthCheck {
  return { name: "x", ok: true, severity: "info", detail: "", ...partial };
}

describe("overallStatus", () => {
  it("is ok when everything passes", () => {
    expect(overallStatus([check({ ok: true, severity: "critical" })])).toBe("ok");
  });

  it("ignores failing info checks", () => {
    expect(overallStatus([check({ ok: false, severity: "info" })])).toBe("ok");
  });

  it("degrades on a failing warning", () => {
    expect(overallStatus([check({ ok: false, severity: "warning" })])).toBe("degraded");
  });

  it("errors when any critical check fails (over a warning)", () => {
    expect(
      overallStatus([
        check({ ok: false, severity: "warning" }),
        check({ ok: false, severity: "critical" }),
      ]),
    ).toBe("error");
  });
});

describe("getHealthReport", () => {
  it("connects to the DB but flags the missing login account on a fresh database", async () => {
    const { getHealthReport } = await import("./health");
    const report = await getHealthReport();

    const db = report.checks.find((c) => c.name === "Database connection & schema");
    expect(db?.ok).toBe(true);

    const login = report.checks.find((c) => c.name === "Login account");
    expect(login?.ok).toBe(false);

    // A failing critical check forces overall "error".
    expect(report.status).toBe("error");
  });

  it("clears the login-account check once an account exists", async () => {
    const queries = await import("./db/queries");
    await queries.ensureSuperAdmin(); // dev fallback seeds admin@local / swim123

    const { getHealthReport } = await import("./health");
    const report = await getHealthReport();

    const login = report.checks.find((c) => c.name === "Login account");
    expect(login?.ok).toBe(true);
  });
});
