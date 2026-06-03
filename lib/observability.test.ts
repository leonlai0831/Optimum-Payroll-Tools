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
