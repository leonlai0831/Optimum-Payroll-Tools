import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Outcome of validating a machine `Authorization: Bearer <key>` header.
 * - "no_server_key": INGEST_API_KEY is not configured → the endpoint is OFF (503).
 * - "unauthorized":  header missing/malformed or the key doesn't match (401).
 * - "ok":            the presented key matches.
 */
export type IngestAuthResult = "ok" | "no_server_key" | "unauthorized";

/**
 * Constant-time bearer-key check. Both sides are SHA-256 hashed to equal-length
 * buffers before `timingSafeEqual`, so neither the key's length nor a matching
 * prefix leaks through response timing. Pure (no env/IO) so it unit-tests directly.
 */
export function checkIngestBearer(
  header: string | null | undefined,
  expectedKey: string | null | undefined,
): IngestAuthResult {
  if (!expectedKey) return "no_server_key";
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  const presented = match?.[1]?.trim() ?? "";
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expectedKey).digest();
  return timingSafeEqual(a, b) ? "ok" : "unauthorized";
}
