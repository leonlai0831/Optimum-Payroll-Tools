import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

const lastRecord = (spy: { mock: { calls: unknown[][] } }) =>
  JSON.parse(spy.mock.calls.at(-1)![0] as string);

describe("structured logger", () => {
  it("writes a JSON record with level, time, msg, and fields to stdout", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";
    logger.info("hello", { userId: 7 });
    const rec = lastRecord(log);
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("hello");
    expect(rec.userId).toBe(7);
    expect(typeof rec.time).toBe("string");
  });

  it("routes warn/error to stderr and expands Error fields with a stack", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";
    logger.error("boom", { err: new Error("nope") });
    const rec = lastRecord(err);
    expect(rec.level).toBe("error");
    expect(rec.err.message).toBe("nope");
    expect(typeof rec.err.stack).toBe("string");
  });

  it("suppresses records below the configured LOG_LEVEL", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.LOG_LEVEL = "warn";
    logger.info("ignored");
    logger.debug("ignored too");
    expect(log).not.toHaveBeenCalled();
  });

  it("merges child bindings into every record", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";
    logger.child({ route: "POST /api/users" }).info("created", { id: 3 });
    const rec = lastRecord(log);
    expect(rec.route).toBe("POST /api/users");
    expect(rec.id).toBe(3);
  });

  it("never throws on a circular field", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.env.LOG_LEVEL = "debug";
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => logger.info("circ", { circular })).not.toThrow();
    expect(log).toHaveBeenCalled();
  });
});
