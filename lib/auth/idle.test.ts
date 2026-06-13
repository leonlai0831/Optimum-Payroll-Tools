import { describe, expect, it } from "vitest";
import {
  IDLE_SERVER_GRACE_MS,
  IDLE_TIMEOUT_MS,
  idleRemainingMs,
  isSessionIdleExpired,
} from "./idle";

const NOW = 1_750_000_000_000;

describe("isSessionIdleExpired", () => {
  it("a fresh session is not expired", () => {
    expect(isSessionIdleExpired(NOW, NOW)).toBe(false);
    expect(isSessionIdleExpired(NOW - IDLE_TIMEOUT_MS, NOW)).toBe(false);
  });

  it("expires only past the timeout PLUS the ping grace", () => {
    const limit = IDLE_TIMEOUT_MS + IDLE_SERVER_GRACE_MS;
    expect(isSessionIdleExpired(NOW - limit, NOW)).toBe(false);
    expect(isSessionIdleExpired(NOW - limit - 1, NOW)).toBe(true);
  });

  it("a session without lastSeenAt (pre-feature or tampered) is expired", () => {
    expect(isSessionIdleExpired(undefined, NOW)).toBe(true);
    expect(isSessionIdleExpired(Number.NaN, NOW)).toBe(true);
  });
});

describe("idleRemainingMs", () => {
  it("counts down from the full timeout and floors at zero", () => {
    expect(idleRemainingMs(NOW, NOW)).toBe(IDLE_TIMEOUT_MS);
    expect(idleRemainingMs(NOW - IDLE_TIMEOUT_MS + 5_000, NOW)).toBe(5_000);
    expect(idleRemainingMs(NOW - IDLE_TIMEOUT_MS, NOW)).toBe(0);
    expect(idleRemainingMs(NOW - IDLE_TIMEOUT_MS - 60_000, NOW)).toBe(0);
  });

  it("returns 0 for a missing lastSeenAt", () => {
    expect(idleRemainingMs(undefined, NOW)).toBe(0);
  });
});
