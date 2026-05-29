import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/db/index.ts runs drizzle migrations at runtime, reading these SQL files by
  // path. @vercel/nft can't trace that dynamic read, so force them into the server
  // bundle — otherwise auto-migrate fails on Vercel with ENOENT.
  outputFileTracingIncludes: {
    "/**": ["./lib/db/migrations/**/*"],
  },
};

export default nextConfig;
