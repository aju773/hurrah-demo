import { test, expect } from "@playwright/test";
import { F1_NAME, frontLowPpiRow, goToStep2, storedDraft, trackUploads, uploadF1AndMatchOrder } from "./helpers";

test("switching to Arabic on step 2 flips to RTL, translates findings and keeps the draft", async ({ page }) => {
  const uploads = trackUploads(page);
  await page.goto("/en/flyers");
  await uploadF1AndMatchOrder(page);
  await goToStep2(page);

  const before = await storedDraft(page);
  expect(before.slots.front.id).toBeTruthy();
  expect(uploads).toHaveLength(1);

  await page.getByRole("link", { name: "Switch to Arabic" }).click();
  await expect(page).toHaveURL(/\/ar\/flyers/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  // Findings read in Arabic (the English sentence from the server is gone).
  await expect(page.getByText("إحدى الصور منخفضة الدقة، لذا قد تبدو غير حادة قليلًا.").first()).toBeVisible();
  await expect(page.getByText("An image is low resolution")).toHaveCount(0);

  // Same Artwork, still on step 2, nothing uploaded again.
  const after = await storedDraft(page);
  expect(after.slots.front.id).toBe(before.slots.front.id);
  expect(after.slots.back.id).toBe(before.slots.back.id);
  expect(after.step).toBe(before.step);
  expect(uploads).toHaveLength(1);

  // The preview is not mirrored: it stays left-to-right with no flip transform.
  const preview = page.getByRole("img", { name: /معاينة/ }).first();
  await expect(preview).toBeVisible();
  const style = await preview.evaluate((el) => {
    const computed = getComputedStyle(el);
    return { direction: computed.direction, transform: computed.transform };
  });
  expect(style).toEqual({ direction: "ltr", transform: "none" });

  // The Arabic copy carries the draft-translation pill.
  await expect(page.getByText("مسودة ترجمة / Draft translation")).toBeVisible();

  // And back: same draft again, still nothing re-uploaded.
  await page.getByRole("link", { name: "التبديل إلى الإنجليزية" }).click();
  await expect(page).toHaveURL(/\/en\/flyers/);
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(frontLowPpiRow(page)).toBeVisible();
  expect((await storedDraft(page)).slots.front.id).toBe(before.slots.front.id);
  expect(uploads).toHaveLength(1);
  await expect(page.getByText("مسودة ترجمة")).toHaveCount(0);
});

test("the uploaded file's cards and options survive a language switch on step 1", async ({ page }) => {
  const uploads = trackUploads(page);
  await page.goto("/en/flyers");
  await uploadF1AndMatchOrder(page);

  await page.getByRole("link", { name: "Switch to Arabic" }).click();
  await expect(page).toHaveURL(/\/ar\/flyers/);

  await expect(page.getByText(F1_NAME).first()).toBeVisible(); // the Front card, not an empty drop zone
  await expect(page.getByText("اسحب ملف PDF وأفلته هنا")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "متابعة" })).toBeEnabled();
  // Option names and labels come from the catalogue in Arabic.
  await expect(page.getByText("المقاس", { exact: true }).first()).toBeVisible();
  expect(uploads).toHaveLength(1);
});

test("Arabic numbers use Western digits and money reads 'N درهم'", async ({ page }) => {
  await page.goto("/ar/flyers");
  const total = page.getByText(/^\d[\d,]*\.\d{2} درهم$/).first();
  await expect(total).toBeVisible();
  const text = await page.locator("main, body").first().innerText();
  expect(text).not.toMatch(/[٠-٩]/);
});

test("header and footer stay English on the Arabic page", async ({ page }) => {
  await page.goto("/ar/flyers");
  await expect(page.getByText("About Hurrah")).toBeVisible();
});
