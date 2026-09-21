// Scripted demo runs: the core journey, money-free, against the real backend and
// frontend (playwright.config.js starts both with the Commerce switch off). Each
// run resets the demo first (`reset_demo`, the presenter's own command), so it
// passes again and again with no manual steps. Two personas, each going Options
// page, Artwork page, approval and ending on the Order confirmation page after a
// short staff moment, in English and Arabic, at desktop width and at 390px. The
// page-by-page behaviour (redirects, Rotate, Swap, Edit options) is in
// journey-pages.spec.js.
import {
  test,
  expect,
  DEMO_FILES,
  VIEWPORTS,
  approveAndSubmit,
  catalogueNames,
  checkPage,
  chooseOption,
  continueToApproval,
  copyFor,
  editOptions,
  expectNoMoney,
  optionButton,
  resetDemo,
  staffMovesOrder,
  startOrdering,
  uploadFront,
} from "./journey-helpers";

const RUNS = [
  { locale: "en", size: "desktop" },
  { locale: "en", size: "phone" },
  { locale: "ar", size: "desktop" },
  { locale: "ar", size: "phone" },
];

// What the customer reads once staff have moved the Order (server text, not in the message files).
const IN_PRODUCTION = { en: /^In production\./, ar: /^قيد الإنتاج/ };
const READY = { en: /^Ready /, ar: /^جاهز / };
const STAFF_CHECK = { en: /^Our team is checking your file/, ar: /^فريقنا يتحقق من ملفك/ };

async function expectStatus(page, pattern) {
  // The confirmation page checks for staff changes every 10 seconds.
  await expect(page.getByRole("status").filter({ hasText: pattern })).toBeVisible({ timeout: 25_000 });
}

for (const { locale, size } of RUNS) {
  test.describe(`${locale} at ${size}`, () => {
    test.use({ viewport: VIEWPORTS[size] });
    test.beforeEach(() => resetDemo());

    const t = copyFor(locale);

    test("print-ready file: auto-fill, approve, confirmation, staff moment", async ({ page, browser, request }, testInfo) => {
      await page.goto(`/${locale}/flyers`);
      await checkPage(page, size);
      await startOrdering(page, t);
      await checkPage(page, size);

      // Nothing chosen yet, so the file fills the options in: A5, double-sided.
      await uploadFront(page, DEMO_FILES.printReady);
      await expect(page.getByText(t("ArtworkSlot", "checking"))).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await checkPage(page, size);

      // The Findings and the preview are on the same page as the upload.
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
      await expect(page.getByRole("img", { name: t.startsWith("ArtworkChecks", "previewLabel") }).first()).toBeVisible();
      await checkPage(page, size);

      // "Edit options" shows what the file filled in and keeps the file.
      const names = await catalogueNames(request, testInfo, locale);
      await editOptions(page, t);
      await expect(optionButton(page, names, "size", "a5")).toContainText("✓");
      await expect(optionButton(page, names, "sides", "double")).toContainText("✓");
      await checkPage(page, size);
      await startOrdering(page, t);
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();

      await continueToApproval(page, t);
      await checkPage(page, size);
      const number = await approveAndSubmit(page, t, locale);
      expect(number).toBe("HUR-10001");
      await checkPage(page, size);

      // No Warnings to accept, so the Order goes straight to production; staff move it on.
      await expectStatus(page, IN_PRODUCTION[locale]);
      await staffMovesOrder(browser, testInfo, number, "Out for delivery");
      await expectStatus(page, READY[locale]);
      await checkPage(page, size);
    });

    test("needs-fixing file: dialogs, Fit/Fill, findings, enlarged view, accepted warnings", async ({ page, browser, request }, testInfo) => {
      const names = await catalogueNames(request, testInfo, locale);
      await page.goto(`/${locale}/flyers`);

      // Layla has chosen A5 already, and her file is A4 with two pages.
      await chooseOption(page, names, "size", "a5");
      await startOrdering(page, t);
      await uploadFront(page, DEMO_FILES.needsFixing);

      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(/A4/);
      await checkPage(page, size);
      await dialog.getByRole("button", { name: t.startsWith("SyncDialog", "keepAndResize") }).click();
      await dialog.getByRole("button", { name: t("SyncDialog", "fillPage") }).click();
      await expect(dialog).toContainText(/%/);
      await dialog.getByRole("button", { name: t("SyncDialog", "confirmFill") }).click();

      // Two pages on a single-sided order: switch the order to double-sided.
      await dialog.getByRole("button", { name: t("SyncDialog", "switchToDouble") }).click();
      await expect(dialog).toHaveCount(0);
      await checkPage(page, size);

      await expect(page.getByText(t("Findings", "low_ppi_warning")).first()).toBeVisible();
      await expect(page.getByText(t("Findings", "bleed_missing_warning")).first()).toBeVisible();
      await checkPage(page, size);

      // Enlarged view from a finding, then back.
      await page.getByRole("button", { name: t("Findings", "low_ppi_warning") }).first().click();
      const enlarged = page.getByRole("dialog");
      await expect(enlarged).toBeVisible();
      await expect(enlarged.getByText(t("ArtworkChecks", "previewOnlyNote"))).toBeVisible();
      await enlarged.getByRole("button", { name: t("ArtworkChecks", "close") }).first().click();
      await expect(enlarged).toBeHidden();

      await continueToApproval(page, t);
      await checkPage(page, size);
      // The Warnings have to be accepted: the submit button waits for the ticks.
      const submit = page.getByRole("button", { name: t("ApproveAndConfirmStep", "submit") });
      await page.getByLabel(t("ApproveAndConfirmStep", "fieldName")).fill("Layla Hassan");
      await page.getByLabel(t("ApproveAndConfirmStep", "fieldMobile")).fill("+971501234567");
      await expect(submit).toBeDisabled();
      const number = await approveAndSubmit(page, t, locale);
      expect(number).toBe("HUR-10001");
      await checkPage(page, size);

      // Warnings accepted, so staff check the file first, then Pass it.
      await expectStatus(page, STAFF_CHECK[locale]);
      await staffMovesOrder(browser, testInfo, number, "Pass");
      await expectStatus(page, IN_PRODUCTION[locale]);
      await checkPage(page, size);
    });
  });
}

/** Presses Tab until `locator` has focus (the way a keyboard user gets there). */
async function tabTo(page, locator, presses = 250) {
  for (let i = 0; i < presses; i++) {
    if (await locator.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${locator}`);
}

test.describe("keyboard only", () => {
  test.use({ viewport: VIEWPORTS.desktop });
  test.beforeEach(() => resetDemo());

  test("the whole journey, from the file to the confirmation, without the mouse", async ({ page }) => {
    const t = copyFor("en");
    await page.goto("/en/flyers");

    // Options page: Start ordering by keyboard; focus lands on the Artwork page's heading.
    await tabTo(page, page.getByRole("button", { name: t("FlyersConfigurator", "startOrdering"), exact: true }));
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/en\/flyers\/artwork/);
    await expect(page.getByRole("heading", { name: t("FlyersConfigurator", "pageArtwork") })).toBeFocused();

    // Browse for the file: the button opens the file chooser from the keyboard.
    await tabTo(page, page.getByRole("button", { name: /browse from your computer/ }).first());
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await chooser).setFiles(DEMO_FILES.printReady);

    await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
    const next = page.getByRole("button", { name: t("FlyersConfigurator", "continue") });
    await expect(next).toBeEnabled();
    await tabTo(page, next);
    await page.keyboard.press("Enter");

    await tabTo(page, page.getByLabel(t("ApproveAndConfirmStep", "fieldName")));
    await page.keyboard.type("Omar Khalid");
    await page.keyboard.press("Tab");
    await page.keyboard.type("+971509876543");
    await tabTo(page, page.getByRole("checkbox", { name: t("ApproveAndConfirmStep", "approvalTick") }));
    await page.keyboard.press("Space");
    await tabTo(page, page.getByRole("button", { name: t("ApproveAndConfirmStep", "submit") }));
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/en\/order\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("HUR-10001");
    await expectNoMoney(page);
  });
});

// What a presenter might touch off-script: none of it may look broken.
test.describe("off-script files", () => {
  test.use({ viewport: VIEWPORTS.desktop, refusedUploadsExpected: true });
  test.beforeEach(() => resetDemo());

  for (const locale of ["en", "ar"]) {
    test(`a JPG is refused with a clean message, ${locale}, and the page still works`, async ({ page }) => {
      const t = copyFor(locale);
      await page.goto(`/${locale}/flyers`);
      await startOrdering(page, t);
      // No Front yet: Continue waits, and says why next to the button.
      await expect(page.getByRole("button", { name: t("FlyersConfigurator", "continue") })).toBeDisabled();
      await expect(page.getByText(t("FlyersConfigurator", "continueNeedsArtwork"))).toBeVisible();
      const jpg = { name: "logo.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]) };
      await page.locator('input[type="file"]').first().setInputFiles(jpg);
      await expect(page.getByText(t("ArtworkErrors", "not_a_pdf"))).toBeVisible();
      await expect(page.getByRole("button", { name: t("FlyersConfigurator", "continue") })).toBeDisabled();
      await expectNoMoney(page);

      // "Upload another file" takes the next real file as if nothing had happened.
      await page.getByRole("button", { name: t("ArtworkSlot", "uploadAnother") }).click();
      await uploadFront(page, DEMO_FILES.printReady);
      await expect(page.getByRole("button", { name: t("FlyersConfigurator", "continue") })).toBeEnabled();
      await expect(page.getByText(t("ArtworkErrors", "not_a_pdf"))).toHaveCount(0);
    });
  }

  test("a password-protected file is refused with the file-unreadable message", async ({ page }) => {
    const t = copyFor("en");
    await page.goto("/en/flyers");
    await startOrdering(page, t);
    await page.locator('input[type="file"]').first().setInputFiles(DEMO_FILES.protected);
    await expect(page.getByText(t("ArtworkErrors", "file_unreadable"))).toBeVisible();
    await expect(page.getByRole("button", { name: t("FlyersConfigurator", "continue") })).toBeDisabled();
    await expectNoMoney(page);
  });
});

test.describe("damaged file", () => {
  test.use({ viewport: VIEWPORTS.desktop });
  test.beforeEach(() => resetDemo());

  test("a repairable file is accepted with a Warning to check", async ({ page }) => {
    const t = copyFor("en");
    await page.goto("/en/flyers");
    await startOrdering(page, t);
    await page.locator('input[type="file"]').first().setInputFiles(DEMO_FILES.damaged);
    await expect(page.getByText(t("Findings", "file_repaired_warning")).first()).toBeVisible();
    await expectNoMoney(page);
  });
});
