import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // PGlite-backed DB tests spin up an in-process Postgres (init + migrations),
    // which can exceed the 5s default on a loaded machine. Give them headroom.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
