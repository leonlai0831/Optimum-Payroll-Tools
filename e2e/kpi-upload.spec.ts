import { test, expect, type Page } from "@playwright/test";

const EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin@local";
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "swim123";
// Relative to the project root (Playwright resolves setInputFiles against cwd).
const FIXTURE = "e2e/fixtures/kpi-sample.csv";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  // exact: the reveal toggle's aria-label ("Show password") also substring-matches.
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Optimum People Hub" })).toBeVisible();
}

test("uploading a KPI CSV parses, merges, and renders the results view", async ({ page }) => {
  await login(page);

  await page.goto("/kpi");
  await expect(page.getByRole("heading", { name: /upload monthly kpi csv/i })).toBeVisible();

  // The file input is visually hidden; setInputFiles drives it directly.
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);

  // After parse → merge → compute the dashboard switches to the results view,
  // headed with the uploaded file and the merged coach/row counts (the fixture's
  // two accounts → two coaches). Both coaches have no teaching allowance, so the
  // leaderboard itself gates them out — that rule is unit-tested; here we just
  // confirm the upload pipeline ran and rendered.
  await expect(page.getByText("kpi-sample.csv")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/2 coaches/)).toBeVisible();
});
