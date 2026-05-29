import { defineConfig, devices } from "@playwright/test";

/**
 * Browser E2E. Only `*.spec.ts` under e2e/ are Playwright tests (the Vitest unit
 * suite uses `*.test.ts`, and the HTTP smoke is `*.mjs` — neither is picked up).
 *
 * The webServer runs `npm run dev` so NODE_ENV=development gives us the
 * admin@local / swim123 bootstrap + the PGlite fallback with zero setup.
 *
 * NOTE: this sandbox can't download the browser, so these run in CI (which can).
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
