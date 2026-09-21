// Scripted demo runs for the three extras, money-free like journey.spec.js and
// reset the same way: the Page picker on a 5-page file, an Artwork template
// downloaded and uploaded again, and the first-visit hints (on for that run only;
// every other run keeps them off). Each run continues to the Order confirmation
// page, in English and Arabic.
import {
  test,
  expect,
  DEMO_FILES,
  VIEWPORTS,
  approveAndSubmit,
  checkPage,
  continueToApproval,
  copyFor,
  resetDemo,
  uploadFront,
} from "./journey-helpers";

const LOCALES = ["en", "ar"];

for (const locale of LOCALES) {
  test.describe(`extras, ${locale}`, () => {
    test.use({ viewport: VIEWPORTS.desktop });
    test.beforeEach(() => resetDemo());

    const t = copyFor(locale);

    test("page picker: pages 3 and 4 become Front and Back, previews follow, confirmation", async ({ page }) => {
      await page.goto(`/${locale}/flyers`);
      await uploadFront(page, DEMO_FILES.fivePages);

      // Five pages: nothing is Artwork until the customer says which pages.
      const picker = page.getByRole("dialog");
      await expect(picker).toBeVisible();
      await expect(picker.getByRole("listitem")).toHaveCount(5);
      await checkPage(page, "desktop");

      await picker.getByRole("button", { name: t.with("PagePicker", "useAsFront", { page: 3 }) }).click();
      await picker.getByRole("button", { name: t.with("PagePicker", "useAsBack", { page: 4 }) }).click();
      await expect(picker.getByRole("button", { name: t.with("PagePicker", "useAsFront", { page: 3 }) })).toHaveAttribute("aria-pressed", "true");
      await expect(picker.getByRole("button", { name: t.with("PagePicker", "useAsBack", { page: 4 }) })).toHaveAttribute("aria-pressed", "true");

      // The server's answer says which pages became Front and Back.
      const assigned = page.waitForResponse((response) => /\/api\/sources\/\d+\/assign\/$/.test(response.url()) && response.request().method() === "POST");
      await picker.getByRole("button", { name: t("PagePicker", "confirm") }).click();
      const { front, back } = await (await assigned).json();
      expect([front.page_index, back.page_index]).toEqual([3, 4]);
      await expect(picker).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await checkPage(page, "desktop");

      // The Artwork page shows a preview for each side, made from those pages, and the pages are A5 with bleed: nothing to fix.
      const preview = (side) => page.getByRole("img", { name: t.with("ArtworkChecks", "previewLabel", { side: t("ArtworkChecks", side) }), exact: true });
      const pictureOf = (side) => preview(side).locator("image").first().getAttribute("href");
      await expect(preview("front")).toBeVisible();
      await expect(preview("back")).toBeVisible();
      expect(await pictureOf("front")).toMatch(new RegExp(`front-${front.id}\\.png$`));
      expect(await pictureOf("back")).toMatch(new RegExp(`back-${back.id}\\.png$`));
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
      await expect(page.locator("[data-hint]")).toHaveCount(0);
      await checkPage(page, "desktop");

      await continueToApproval(page, t);
      const number = await approveAndSubmit(page, t, locale);
      expect(number).toBe("HUR-10001");
      await checkPage(page, "desktop");
    });

    test("artwork template: download A5, upload it unchanged, Ready to print, confirmation", async ({ page }, testInfo) => {
      await page.goto(`/${locale}/flyers`);
      const templates = page.getByRole("list", { name: t("ArtworkTemplates", "listLabel") });
      await expect(templates).toBeVisible();
      await expect(page.locator("[data-hint]")).toHaveCount(0);

      const download = page.waitForEvent("download");
      await templates.getByRole("link").filter({ hasText: "148 × 210" }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/\.pdf$/i);
      const templatePdf = testInfo.outputPath(file.suggestedFilename());
      await file.saveAs(templatePdf);

      // Nothing chosen yet, so the template fills the options in: A5, double-sided.
      await uploadFront(page, templatePdf);
      await expect(page.getByText(t("ArtworkSlot", "checking"))).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await checkPage(page, "desktop");

      await expect(page.getByRole("status").filter({ hasText: t("Preflight", "headlineOk").replace(/^\S+\s/, "") })).toBeVisible();
      await continueToConfirmationFromStep2(page, t, locale);
    });
  });
}

/** From a step 2 that is already showing "Ready to print" to the confirmation page. */
async function continueToConfirmationFromStep2(page, t, locale) {
  await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
  await checkPage(page, "desktop");
  await continueToApproval(page, t);
  await checkPage(page, "desktop");
  const number = await approveAndSubmit(page, t, locale);
  expect(number).toBe("HUR-10001");
  await checkPage(page, "desktop");
}

for (const locale of LOCALES) {
  test.describe(`hints, ${locale}`, () => {
    test.use({ viewport: VIEWPORTS.desktop, hintsOn: true });
    test.beforeEach(() => resetDemo());

    const t = copyFor(locale);

    test("a hint shows on the first visit, Escape dismisses it, a reload shows none, and the journey goes on", async ({ page }) => {
      await page.goto(`/${locale}/flyers`);
      const hint = page.locator('[data-hint="options"]');
      await expect(hint).toBeVisible();
      await expect(hint).toContainText(t("Hints", "options"));
      await expect(hint).toHaveAttribute("aria-live", "polite");
      await checkPage(page, "desktop");

      // Not modal: the page underneath still works while the hint is up.
      const start = page.getByRole("button", { name: t("FlyersConfigurator", "startOrdering") });
      await expect(start).toBeEnabled();

      await page.keyboard.press("Escape");
      await expect(hint).toHaveCount(0);

      await page.reload();
      await page.waitForLoadState("networkidle");
      await expect(start).toBeVisible();
      await expect(page.locator('[data-hint="options"]')).toHaveCount(0);

      // One hint per page: the Artwork page shows its own, then the approval page.
      await start.click();
      await expect(page.locator('[data-hint="artwork"]')).toBeVisible();
      await uploadFront(page, DEMO_FILES.printReady);
      await expect(page.locator('[data-hint="artwork"]')).toBeVisible();
      await continueToApproval(page, t);
      await expect(page.locator('[data-hint="approval"]')).toBeVisible();
      const number = await approveAndSubmit(page, t, locale);
      expect(number).toBe("HUR-10001");
      await checkPage(page, "desktop");
    });
  });
}
