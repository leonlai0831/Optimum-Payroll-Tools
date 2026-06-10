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
  // Users / Audit log / Permissions moved out of Staff into the System Setting
  // section (super_admin only); Category Visibility later merged into the
  // Permissions page (role defaults + user overrides) — keep old bookmarks working.
  async redirects() {
    return [
      { source: "/staff/users", destination: "/system/users", permanent: true },
      { source: "/staff/audit", destination: "/system/audit", permanent: true },
      { source: "/staff/permissions", destination: "/system/permissions", permanent: true },
      { source: "/system/categories", destination: "/system/permissions", permanent: true },
    ];
  },
};

export default nextConfig;
