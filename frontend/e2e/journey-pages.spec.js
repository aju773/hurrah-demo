// Scripted demo runs for the three-page journey itself, money-free like
// journey.spec.js and reset the same way: what each page holds, how the customer
// moves between them (Start ordering, browser Back, reload, a cold address), Rotate
// and Swap, "Edit options", and a new journey after an Order. English and Arabic,
// at desktop width and at 390px where the page's layout differs.
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
  optionButton,
  resetDemo,
  startOrdering,
  storedDraft,
  trackUploads,
  uploadFront,
} from "./journey-helpers";

const RUNS = [
  { locale: "en", size: "desktop" },
  { locale: "en", size: "phone" },
  { locale: "ar", size: "desktop" },
  { locale: "ar", size: "phone" },
];

const OPTIONS_ADDRESS = (locale) => new RegExp(`/${locale}/flyers(\\?|$)`);
const ARTWORK_ADDRESS = (locale) => new RegExp(`/${locale}/flyers/artwork`);

/** The Artwork page's Summary bar: it holds the whole Configuration line at any
 * width (visible on a phone, present but hidden on desktop, where the panel shows). */
const summaryBar = (page) => page.locator('button[aria-controls="summary-panel"]');

/** The preview requests the Artwork page makes, as { url, params, json }. */
function trackPreviews(page) {
  const previews = [];
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!/\/api\/products\/flyers\/preview\/$/.test(url.pathname) || !response.ok()) return;
    previews.push({ url: response.url(), params: url.searchParams, json: await response.json().catch(() => null) });
  });
  return previews;
}

for (const { locale, size } of RUNS) {
  test.describe(`pages, ${locale} at ${size}`, () => {
    test.use({ viewport: VIEWPORTS[size] });
    test.beforeEach(() => resetDemo());

    const t = copyFor(locale);

    test("Options page holds only Options and the Summary, no upload, no money", async ({ page, request }, testInfo) => {
      const names = await catalogueNames(request, testInfo, locale);
      await page.goto(`/${locale}/flyers`);
      await expect(page.getByRole("heading", { name: t("FlyersConfigurator", "pageOptions") })).toBeVisible();

      for (const code of ["size", "paper", "sides"]) {
        await expect(page.getByRole("group", { name: names.optionName(code), exact: true })).toBeVisible();
      }
      for (const code of ["quantity", "turnaround"]) {
        await expect(page.getByRole("radiogroup", { name: names.optionName(code), exact: true })).toBeVisible();
      }
      await expect(page.getByRole("heading", { name: t("FlyersConfigurator", "configurationSummary") })).toBeVisible();
      await expect(page.getByRole("button", { name: t("FlyersConfigurator", "startOrdering"), exact: true })).toBeEnabled();

      // No Artwork here: no upload box, no templates, no "Need a design?".
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      await expect(page.getByRole("list", { name: t("ArtworkTemplates", "listLabel") })).toHaveCount(0);
      await expect(page.getByRole("button", { name: t("FlyersConfigurator", "needDesign") })).toHaveCount(0);
      await checkPage(page, size);
    });

    test("Start ordering, browser Back and Forward, reload and cold addresses", async ({ page, browser, request }, testInfo) => {
      const names = await catalogueNames(request, testInfo, locale);
      const uploads = trackUploads(page);
      await page.goto(`/${locale}/flyers`);

      // The customer's choices (A5 is already the default size, so they match the file used below).
      await chooseOption(page, names, "paper", "350gsm-matt");
      await chooseOption(page, names, "sides", "double");
      await startOrdering(page, t);
      await expect(page).toHaveURL(ARTWORK_ADDRESS(locale));
      await expect(summaryBar(page)).toContainText(names.valueLabel("paper", "350gsm-matt"));
      await expect(summaryBar(page)).toContainText(names.valueLabel("sides", "double"));
      await checkPage(page, size);

      await uploadFront(page, DEMO_FILES.printReady);
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const before = await storedDraft(page);
      expect(before.slots.front.id).toBeTruthy();
      expect(uploads).toHaveLength(1);

      // Reload: same page, same Configuration, same files, nothing uploaded again.
      await page.reload();
      await expect(page.getByRole("heading", { name: t("FlyersConfigurator", "pageArtwork") })).toBeVisible();
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
      await expect(summaryBar(page)).toContainText(names.valueLabel("paper", "350gsm-matt"));
      expect((await storedDraft(page)).slots.front.id).toBe(before.slots.front.id);
      expect(uploads).toHaveLength(1);

      // Browser Back: the Options page with the choices intact; Forward: the file is still there.
      await page.goBack();
      await expect(page).toHaveURL(OPTIONS_ADDRESS(locale));
      await expect(page.getByRole("heading", { name: t("FlyersConfigurator", "pageOptions") })).toBeVisible();
      await expect(optionButton(page, names, "paper", "350gsm-matt")).toContainText("✓");
      await expect(optionButton(page, names, "sides", "double")).toContainText("✓");
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      await checkPage(page, size);
      await page.goForward();
      await expect(page).toHaveURL(ARTWORK_ADDRESS(locale));
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
      expect((await storedDraft(page)).slots.front.id).toBe(before.slots.front.id);
      expect(uploads).toHaveLength(1);

      // A visitor with no Configuration is sent to the Options page from either later address.
      const cold = await browser.newContext({ baseURL: testInfo.project.use.baseURL, viewport: VIEWPORTS[size] });
      try {
        const visitor = await cold.newPage();
        await visitor.addInitScript(() => {
          window.__HURRAH_HINTS__ = false;
        });
        await visitor.goto(`/${locale}/flyers/artwork`);
        await expect(visitor).toHaveURL(OPTIONS_ADDRESS(locale));
        await expect(visitor.getByRole("heading", { name: t("FlyersConfigurator", "pageOptions") })).toBeVisible();
        await visitor.goto(`/${locale}/flyers/approve`);
        await expect(visitor).toHaveURL(OPTIONS_ADDRESS(locale));
        await expect(visitor.getByRole("heading", { name: t("FlyersConfigurator", "pageOptions") })).toBeVisible();

        // Started, but no accepted Front yet: the approval address goes to the Artwork page.
        await startOrdering(visitor, t);
        await visitor.goto(`/${locale}/flyers/approve`);
        await expect(visitor).toHaveURL(ARTWORK_ADDRESS(locale));
        await expect(visitor.getByRole("heading", { name: t("FlyersConfigurator", "pageArtwork") })).toBeVisible();
      } finally {
        await cold.close();
      }
    });

    test("Rotate and Swap change the preview and the Findings and leave the file untouched", async ({ page, request }, testInfo) => {
      const { apiUrl } = testInfo.project.metadata;
      const uploads = trackUploads(page);
      const previews = trackPreviews(page);
      await page.goto(`/${locale}/flyers`);
      await startOrdering(page, t);

      // F1 (Layla's two pages) with nothing chosen yet fills the options in (A4, double-sided).
      await uploadFront(page, DEMO_FILES.needsFixing);
      await expect(page.getByText(t("Findings", "low_ppi_warning")).first()).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const { slots } = await storedDraft(page);
      const [frontId, backId] = [slots.front.id, slots.back.id];
      expect(backId).toBeTruthy();
      const stored = async () => [await (await request.get(`${apiUrl}/api/artworks/${frontId}/`)).json(), await (await request.get(`${apiUrl}/api/artworks/${backId}/`)).json()];
      const original = await stored();
      const uploadsBefore = uploads.length;

      const side = (name) => page.getByRole("img", { name: t.with("ArtworkChecks", "previewLabel", { side: t("ArtworkChecks", name) }), exact: true });
      const rotate = (name) => page.getByRole("button", { name: t.with("ArtworkChecks", "rotateSide", { side: t("ArtworkChecks", name) }), exact: true });
      const undoRotate = (name) => page.getByRole("button", { name: t.with("ArtworkChecks", "undoRotateSide", { side: t("ArtworkChecks", name) }), exact: true });
      const lowPpiBox = (preview) => preview.json.front.findings.find((finding) => finding.code === "low_ppi").bbox;
      const latest = () => previews[previews.length - 1];

      await expect(side("front")).toBeVisible();
      const plain = previews.find((preview) => !preview.params.has("rotate") && !preview.params.has("swap"));
      expect(plain.json.front.rotation ?? 0).toBe(0);
      await expect(side("front").locator("image").first()).not.toHaveAttribute("transform", /rotate/);

      // Rotate the Front: the preview is turned and the Finding sits where it now shows.
      const seen = previews.length;
      await rotate("front").click();
      await expect(undoRotate("front")).toBeVisible();
      await expect.poll(() => previews.slice(seen).some((preview) => preview.params.get("rotate") === "front")).toBe(true);
      const rotated = previews.slice(seen).find((preview) => preview.params.get("rotate") === "front");
      expect(rotated.json.front.rotation).toBe(90);
      expect(lowPpiBox(rotated)).not.toEqual(lowPpiBox(plain));
      await expect(side("front").locator("image").first()).toHaveAttribute("transform", /^rotate\(90/);
      await expect(page.getByText(t("Findings", "low_ppi_warning")).first()).toBeVisible();
      await checkPage(page, size);

      // It is kept across a trip to the Options page and back, and can be undone.
      await editOptions(page, t);
      await startOrdering(page, t);
      await expect(undoRotate("front")).toBeVisible();
      await expect((await storedDraft(page)).rotate.front).toBe(true);
      await undoRotate("front").click();
      await expect(rotate("front")).toBeVisible();
      await expect(side("front").locator("image").first()).not.toHaveAttribute("transform", /rotate/);

      // Swap: the uploaded Back prints as Front, and the other way round.
      const swapButton = page.getByRole("button", { name: t("ArtworkChecks", "swapSides"), exact: true });
      const beforeSwap = previews.length;
      await swapButton.click();
      await expect(page.getByRole("button", { name: t("ArtworkChecks", "undoSwap"), exact: true })).toBeVisible();
      await expect(page.getByText(t("ArtworkChecks", "swapNote"))).toBeVisible();
      await expect.poll(() => previews.slice(beforeSwap).some((preview) => preview.params.get("swap") === "true")).toBe(true);
      const swapped = previews.slice(beforeSwap).find((preview) => preview.params.get("swap") === "true");
      expect(swapped.json.front.artwork_id).toBe(backId);
      expect(swapped.json.back.artwork_id).toBe(frontId);
      await expect(side("front").locator("image").first()).toHaveAttribute("href", swapped.json.front.image_url);
      await checkPage(page, size);

      await editOptions(page, t);
      await startOrdering(page, t);
      await expect(page.getByRole("button", { name: t("ArtworkChecks", "undoSwap"), exact: true })).toBeVisible();
      expect((await storedDraft(page)).swap).toBe(true);
      await page.getByRole("button", { name: t("ArtworkChecks", "undoSwap"), exact: true }).click();
      await expect(swapButton).toBeVisible();
      await expect.poll(() => latest().params.has("swap")).toBe(false);

      // The uploaded files are exactly as they were: no new upload, the stored Artwork unchanged.
      expect(uploads).toHaveLength(uploadsBefore);
      expect(await stored()).toEqual(original);
      const after = await storedDraft(page);
      expect([after.slots.front.id, after.slots.back.id]).toEqual([frontId, backId]);
    });

    test("Edit options: a Size change keeps the file and re-checks it", async ({ page, request }, testInfo) => {
      const names = await catalogueNames(request, testInfo, locale);
      const uploads = trackUploads(page);
      const previews = trackPreviews(page);
      await page.goto(`/${locale}/flyers`);
      await startOrdering(page, t);
      await uploadFront(page, DEMO_FILES.printReady);
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
      const frontId = (await storedDraft(page)).slots.front.id;

      // The file is A5; the customer changes the order to A4 and comes back.
      await editOptions(page, t);
      await chooseOption(page, names, "size", "a4");
      await startOrdering(page, t);
      expect((await storedDraft(page)).slots.front.id).toBe(frontId);

      // The Artwork is kept: the difference is raised as a dialog, and Keep A4 resizes the file.
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(/A5/);
      await expect(dialog).toContainText(/A4/);
      await checkPage(page, size);
      const seen = previews.length;
      await dialog.getByRole("button", { name: t.startsWith("SyncDialog", "keepAndResize") }).click();
      await dialog.getByRole("button", { name: t("SyncDialog", "fillPage") }).click();
      await dialog.getByRole("button", { name: t("SyncDialog", "confirmFill") }).click();
      await expect(dialog).toHaveCount(0);

      // The Preflight report is re-made for A4 with the same file, and nothing is uploaded again.
      await expect.poll(() => previews.slice(seen).some((preview) => preview.params.get("size") === "a4" && preview.params.has("resize_mode"))).toBe(true);
      await expect(summaryBar(page)).toContainText(names.valueLabel("size", "a4"));
      expect((await storedDraft(page)).slots.front.id).toBe(frontId);
      expect(uploads).toHaveLength(1);
      await checkPage(page, size);
    });

    test("Edit options: choosing single-sided drops the Back with a notice", async ({ page, request }, testInfo) => {
      const names = await catalogueNames(request, testInfo, locale);
      const uploads = trackUploads(page);
      await page.goto(`/${locale}/flyers`);
      await startOrdering(page, t);
      await uploadFront(page, DEMO_FILES.printReady); // two pages: Front and Back, double-sided
      await expect(page.getByText(t("ArtworkChecks", "noFindings"))).toBeVisible();
      const preview = (name) => page.getByRole("img", { name: t.with("ArtworkChecks", "previewLabel", { side: t("ArtworkChecks", name) }), exact: true });
      await expect(preview("back")).toBeVisible();
      const frontId = (await storedDraft(page)).slots.front.id;

      await editOptions(page, t);
      await chooseOption(page, names, "sides", "single");
      await expect(page.getByText(t("FlyersConfigurator", "backDroppedNotice"))).toHaveCount(0); // said on the Artwork page
      await startOrdering(page, t);

      await expect(page.getByText(t("FlyersConfigurator", "backDroppedNotice"))).toBeVisible();
      await expect(preview("front")).toBeVisible();
      await expect(preview("back")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const draft = await storedDraft(page);
      expect(draft.slots.front.id).toBe(frontId);
      expect(draft.slots.back).toBeNull();
      expect(uploads).toHaveLength(1);
      await checkPage(page, size);
      await expect(page.getByRole("button", { name: t("FlyersConfigurator", "continue") })).toBeEnabled();
    });

    test("a new journey after an Order starts at the Options page", async ({ page }) => {
      await page.goto(`/${locale}/flyers`);
      await startOrdering(page, t);
      await uploadFront(page, DEMO_FILES.printReady);
      await continueToApproval(page, t);
      const number = await approveAndSubmit(page, t, locale);
      expect(number).toBe("HUR-10001");

      // The Order is placed, so the draft is gone: the journey opens at the Options page with the defaults ...
      await page.goto(`/${locale}/flyers`);
      await expect(page).toHaveURL(OPTIONS_ADDRESS(locale));
      await expect(page.getByRole("heading", { name: t("FlyersConfigurator", "pageOptions") })).toBeVisible();
      await expect(page.locator('input[type="file"]')).toHaveCount(0);
      expect(await storedDraft(page).then((draft) => draft?.slots?.front ?? null)).toBeNull();
      await checkPage(page, size);

      // ... and the later pages are not there to go back to.
      await page.goto(`/${locale}/flyers/artwork`);
      await expect(page).toHaveURL(OPTIONS_ADDRESS(locale));
      await page.goto(`/${locale}/flyers/approve`);
      await expect(page).toHaveURL(OPTIONS_ADDRESS(locale));
    });
  });
}
