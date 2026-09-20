import { test, expect } from "@playwright/test";

test("serves /en left-to-right and /ar right-to-left", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("the retired standalone upload page redirects to Flyers in both languages", async ({ page }) => {
  for (const locale of ["en", "ar"]) {
    await page.goto(`/${locale}/order/upload`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/flyers$`));
  }
});

test("the site root opens the Flyers journey in both languages", async ({ page }) => {
  for (const locale of ["en", "ar"]) {
    await page.goto(`/${locale}`);
    await expect(page).toHaveURL(new RegExp(`/${locale}/flyers$`));
  }
});

test("the journey shows no control that goes nowhere", async ({ page }) => {
  await page.goto("/en/flyers");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const dead = await page.locator('a[href="#"], a:not([href])').count();
  expect(dead).toBe(0);
  await expect(page.locator("header nav, header input, footer a")).toHaveCount(0);
});
