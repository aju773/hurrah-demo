import path from "node:path";
import { expect } from "@playwright/test";

export const FIXTURES = {
  // Layla's A4 file: 2 pages, no bleed, coloured edge, ~200 ppi logo, RGB.
  f1: path.resolve(__dirname, "fixtures/generated/f1-layla-a4-no-bleed.pdf"),
  f2: path.resolve(__dirname, "fixtures/generated/f2-omar-a5-clean.pdf"),
};

export const F1_NAME = "f1-layla-a4-no-bleed.pdf";

/** Counts every POST to the artwork upload endpoint, so a test can prove a
 * language switch or a reload never re-uploads (or re-checks) a file. */
export function trackUploads(page) {
  const uploads = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/artworks/") uploads.push(request.url());
  });
  return uploads;
}

/** Drops F1 into Front (a 2-page PDF fills Back too) and answers the option–file
 * dialogs it raises (A4 file on an A5 order, 2 pages on a single-sided order) by
 * switching the order to match the file, whatever order they come in. */
export async function uploadF1AndMatchOrder(page) {
  await page.locator('input[type="file"]').first().setInputFiles(FIXTURES.f1);

  const dialog = page.locator("div.fixed.inset-0.z-50");
  const continueButton = page.getByRole("button", { name: "Continue" });
  for (let i = 0; i < 5; i++) {
    // Either a dialog opens, or the draft is already consistent and Continue enables.
    await expect(dialog.or(continueButton.and(page.locator(":enabled"))).first()).toBeVisible({ timeout: 30_000 });
    if ((await dialog.count()) === 0) break;
    const seeTotal = dialog.getByRole("button", { name: "See the new total" });
    if (await seeTotal.count()) await seeTotal.click();
    await dialog.getByRole("button", { name: /^(Confirm — switch to|Switch order to)/ }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(continueButton).toBeEnabled();
}

/** F1's Front low-resolution row in step 2's findings list. */
export function frontLowPpiRow(page) {
  return page.getByRole("button", { name: /Front.*low resolution/ });
}

/** Continue to step 2 (Check & preview). */
export async function goToStep2(page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(frontLowPpiRow(page)).toBeVisible();
}

export async function storedDraft(page) {
  return page.evaluate(() => JSON.parse(window.sessionStorage.getItem("flyers-draft-order")));
}
