import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local-dev DB fallback) ships native Node fs/WASM handling that breaks when
  // bundled into the server build — it surfaces as a bogus "path ... Received an instance
  // of URL" error on the first query. Load it via native require instead.
  serverExternalPackages: ["@electric-sql/pglite", "@sentry/node"],
  // lib/db/index.ts runs drizzle migrations at runtime, reading these SQL files by
  // path. @vercel/nft can't trace that dynamic read, so force them into the server
  // bundle — otherwise auto-migrate fails on Vercel with ENOENT.
  outputFileTracingIncludes: {
    "/**": ["./lib/db/migrations/**/*"],
  },
};

export default nextConfig;
