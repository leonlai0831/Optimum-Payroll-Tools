import { test, expect } from "@playwright/test";

const EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin@local";
const PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "swim123";

test("an unauthenticated visit is redirected to the login page", async ({ page }) => {
  await page.goto("/kpi");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("the super admin can sign in and lands on the hub", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.getByRole("heading", { name: "Optimum Payroll Tools" })).toBeVisible();
  await expect(page.getByText("Instructor KPI Bonus")).toBeVisible();
});
