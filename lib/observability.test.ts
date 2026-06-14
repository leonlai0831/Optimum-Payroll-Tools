import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@sentry/node");
  delete process.env.SENTRY_DSN;
});

describe("observability (Sentry)", () => {
  it("is a graceful no-op without SENTRY_DSN", async () => {
    delete process.env.SENTRY_DSN;
    const obs = await import("./observability");
    await obs.initObservability();
    expect(obs.isObservabilityEnabled()).toBe(false);
    expect(() => obs.captureException(new Error("x"))).not.toThrow();
  });

  it("initializes Sentry from the DSN and forwards explicit captures", async () => {
    process.env.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0";
    const init = vi.fn();
    const captureException = vi.fn();
    vi.doMock("@sentry/node", () => ({ init, captureException, captureMessage: vi.fn() }));

    const obs = await import("./observability");
    await obs.initObservability();

    expect(init).toHaveBeenCalledWith(expect.objectContaining({ dsn: process.env.SENTRY_DSN }));
    expect(obs.isObservabilityEnabled()).toBe(true);
    obs.captureException(new Error("boom"));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("auto-forwards logger.error to Sentry once initialized", async () => {
    process.env.SENTRY_DSN = "https://k@o0.ingest.sentry.io/0";
    const captureException = vi.fn();
    vi.doMock("@sentry/node", () => ({ init: vi.fn(), captureException, captureMessage: vi.fn() }));

    const { logger } = await import("./log");
    const obs = await import("./observability");
    await obs.initObservability();

    logger.error("kaboom", { err: new Error("e") });
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});

/**
 * The in-app error log must capture the `cause` chain — the Postgres SQLSTATE /
 * driver code lives on `err.cause` (drizzle wraps the driver error), so without
 * this the stored stack is an undiagnosable `Failed query: …` wrapper.
 */
describe("serializeError — captures the cause chain + SQLSTATE", () => {
  it("appends a pg driver cause with its code", async () => {
    const { serializeError } = await import("./observability");
    const wrapper = new Error('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"');
    (wrapper as { cause?: unknown }).cause = { code: "53300", message: "too many connections" };
    const { message, stack } = serializeError(wrapper);
    expect(message).toBe('Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"');
    expect(stack).toContain("Caused by: [code: 53300] too many connections");
  });

  it("walks a multi-level cause chain", async () => {
    const { serializeError } = await import("./observability");
    const inner = { code: "ECONNRESET", message: "socket hang up" };
    const mid = new Error("connect failed");
    (mid as { cause?: unknown }).cause = inner;
    const outer = new Error("init failed");
    (outer as { cause?: unknown }).cause = mid;
    const { stack } = serializeError(outer);
    expect(stack).toContain("Caused by: connect failed");
    expect(stack).toContain("Caused by: [code: ECONNRESET] socket hang up");
  });

  it("returns just the wrapper stack when there's no cause", async () => {
    const { serializeError } = await import("./observability");
    const { message, stack } = serializeError(new Error("plain"));
    expect(message).toBe("plain");
    expect(stack).toContain("plain"); // err.stack includes the message
    expect(stack).not.toContain("Caused by");
  });
});
