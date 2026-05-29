import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin@local";
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "swim123";
const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "kpi-sample.csv");

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Optimum Payroll Tools" })).toBeVisible();
}

test("uploading a KPI CSV merges accounts and renders the leaderboard", async ({ page }) => {
  await login(page);

  await page.goto("/kpi");
  await expect(page.getByRole("heading", { name: /upload monthly kpi csv/i })).toBeVisible();

  // The file input is visually hidden; setInputFiles drives it directly.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);

  // After parse → AI/deterministic merge → client-side compute, the leaderboard
  // shows the (canonicalised, upper-cased) coach names from the fixture.
  await expect(page.getByText("ALICE TAN")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("BOBBY LEE")).toBeVisible();
});
