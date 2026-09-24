// Single-screen fit check (CONTEXT.md): at a desktop/laptop floor of 1024x700, a
// journey page fits the viewport with no scroll, and its primary action (and, once
// it has one, its Back / Edit options control) stays reachable without scrolling.
// Below the floor the page scrolls normally instead and the primary action stays
// pinned. Money-free like journey.spec.js, English and Arabic.
//
// PAGES lists one entry per journey page that is Single-screen: Options (ticket
// 02), Artwork (ticket 04) and Approve (ticket 05).
import {
  test,
  BELOW_FLOOR_VIEWPORT,
  DEMO_FILES,
  SINGLE_SCREEN_VIEWPORTS,
  continueToApproval,
  copyFor,
  expectSingleScreen,
  resetDemo,
  startOrdering,
  uploadFront,
} from "./journey-helpers";

const LOCALES = ["en", "ar"];

const PAGES = [
  {
    name: "Options",
    open: async (page, locale) => {
      await page.goto(`/${locale}/flyers`);
    },
    primary: (page, t) => page.getByRole("button", { name: t("FlyersConfigurator", "startOrdering"), exact: true }),
  },
  {
    // With Artwork uploaded (ticket 04): the fit check with the Front slot, the
    // Findings and the Proof preview all actually on screen, not the empty page.
    name: "Artwork",
    open: async (page, locale, t) => {
      await page.goto(`/${locale}/flyers`);
      await startOrdering(page, t);
      await uploadFront(page, DEMO_FILES.printReady);
      await page.getByText(t("ArtworkChecks", "noFindings")).waitFor();
    },
    primary: (page, t) => page.getByRole("button", { name: t("FlyersConfigurator", "continue"), exact: true }),
    secondary: (page, t) => page.getByRole("button", { name: t("FlyersConfigurator", "editOptions"), exact: true }),
  },
  {
    // With Artwork uploaded and Continue pressed (ticket 05): the fit check with
    // the Proof, the Configuration, the countdown and the acknowledgements
    // actually on screen.
    name: "Approve",
    open: async (page, locale, t) => {
      await page.goto(`/${locale}/flyers`);
      await startOrdering(page, t);
      await uploadFront(page, DEMO_FILES.printReady);
      await page.getByText(t("ArtworkChecks", "noFindings")).waitFor();
      await continueToApproval(page, t);
    },
    primary: (page, t) => page.getByRole("button", { name: t("ApproveAndConfirmStep", "submit"), exact: true }),
    secondary: (page, t) => page.getByRole("button", { name: t("ApproveAndConfirmStep", "backButton"), exact: true }),
  },
];

for (const locale of LOCALES) {
  const t = copyFor(locale);

  test.describe(`single-screen fit, ${locale}`, () => {
    test.beforeEach(() => resetDemo());

    for (const size of SINGLE_SCREEN_VIEWPORTS) {
      test.describe(`at ${size.width}x${size.height}`, () => {
        test.use({ viewport: size });

        for (const journeyPage of PAGES) {
          test(`the ${journeyPage.name} page fits with no scroll`, async ({ page }) => {
            await journeyPage.open(page, locale, t);
            await expectSingleScreen(page, {
              primary: journeyPage.primary(page, t),
              secondary: journeyPage.secondary?.(page, t),
            });
          });
        }
      });
    }

    test.describe("below the floor", () => {
      test.use({ viewport: BELOW_FLOOR_VIEWPORT });

      for (const journeyPage of PAGES) {
        test(`the ${journeyPage.name} page scrolls and its primary action stays reachable`, async ({ page }) => {
          await journeyPage.open(page, locale, t);
          await expectSingleScreen(page, { primary: journeyPage.primary(page, t), floor: false });
        });
      }
    });
  });
}
