import { describe, expect, it } from "vitest";
import { checkIngestBearer } from "./auth";

describe("checkIngestBearer", () => {
  it("reports the endpoint as unconfigured when no server key is set", () => {
    expect(checkIngestBearer("Bearer whatever", undefined)).toBe("no_server_key");
    expect(checkIngestBearer("Bearer whatever", "")).toBe("no_server_key");
  });

  it("accepts the exact key with a Bearer prefix (case-insensitive, extra whitespace ok)", () => {
    expect(checkIngestBearer("Bearer sekrit-123", "sekrit-123")).toBe("ok");
    expect(checkIngestBearer("bearer sekrit-123", "sekrit-123")).toBe("ok");
    expect(checkIngestBearer("Bearer   sekrit-123  ", "sekrit-123")).toBe("ok");
  });

  it("rejects a missing or malformed header", () => {
    expect(checkIngestBearer(null, "sekrit-123")).toBe("unauthorized");
    expect(checkIngestBearer("", "sekrit-123")).toBe("unauthorized");
    expect(checkIngestBearer("sekrit-123", "sekrit-123")).toBe("unauthorized"); // no Bearer prefix
    expect(checkIngestBearer("Basic sekrit-123", "sekrit-123")).toBe("unauthorized");
  });

  it("rejects a wrong key, including different lengths, without throwing", () => {
    expect(checkIngestBearer("Bearer nope", "sekrit-123")).toBe("unauthorized");
    expect(checkIngestBearer("Bearer sekrit-12", "sekrit-123")).toBe("unauthorized"); // prefix only
    expect(checkIngestBearer("Bearer sekrit-1234", "sekrit-123")).toBe("unauthorized");
    // Hash-then-compare keeps timingSafeEqual on equal-length buffers — a
    // length mismatch must never surface as an exception (500) to the caller.
    expect(() => checkIngestBearer("Bearer x", "a-much-longer-key")).not.toThrow();
  });
});
