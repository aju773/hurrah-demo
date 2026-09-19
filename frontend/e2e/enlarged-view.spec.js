import { test, expect } from "@playwright/test";
import { frontLowPpiRow, goToStep2, uploadF1AndMatchOrder } from "./helpers";

test("opening F1's low-resolution finding shows the enlarged view with the finding highlighted", async ({ page }) => {
  await page.goto("/en/flyers");
  await uploadF1AndMatchOrder(page);
  await goToStep2(page);

  await frontLowPpiRow(page).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Preview only — your file prints at its full quality.")).toBeVisible();

  // The chosen Finding is outlined and pulsing in the enlarged preview.
  const highlight = dialog.locator("svg rect.animate-pulse").first();
  await expect(highlight).toBeVisible();
  const box = await highlight.boundingBox();
  expect(box.width).toBeGreaterThan(1);
  expect(box.height).toBeGreaterThan(1);
});

test("the enlarged view switches sides and zoom levels and closes with Escape", async ({ page }) => {
  await page.goto("/en/flyers");
  await uploadF1AndMatchOrder(page);
  await goToStep2(page);

  await frontLowPpiRow(page).click();
  const dialog = page.getByRole("dialog");

  const frontPreview = dialog.getByRole("img");
  const fitWidth = (await frontPreview.boundingBox()).width;
  await dialog.getByRole("button", { name: "200%" }).click();
  await expect.poll(async () => (await frontPreview.boundingBox()).width).toBeGreaterThan(fitWidth);

  await dialog.getByRole("button", { name: "Back", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "Back preview" })).toBeVisible();

  await dialog.getByRole("button", { name: "As printed" }).click();
  await expect(dialog.getByRole("button", { name: "As printed" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
