// Single-screen fit check (CONTEXT.md): at a desktop/laptop floor of 1024x700, a
// journey page fits the viewport with no scroll, and its primary action (and, once
// it has one, its Back / Edit options control) stays reachable without scrolling.
// Below the floor the page scrolls normally instead and the primary action stays
// pinned. Money-free like journey.spec.js, English and Arabic.
//
// PAGES lists one entry per journey page that is Single-screen so far. A later
// ticket that makes the Artwork or Approve page Single-screen adds its own entry
// here, the same way it already adds its page to journey-pages.spec.js.
import {
  test,
  BELOW_FLOOR_VIEWPORT,
  SINGLE_SCREEN_VIEWPORTS,
  copyFor,
  expectSingleScreen,
  resetDemo,
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
            await journeyPage.open(page, locale);
            await expectSingleScreen(page, { primary: journeyPage.primary(page, t) });
          });
        }
      });
    }

    test.describe("below the floor", () => {
      test.use({ viewport: BELOW_FLOOR_VIEWPORT });

      for (const journeyPage of PAGES) {
        test(`the ${journeyPage.name} page scrolls and its primary action stays reachable`, async ({ page }) => {
          await journeyPage.open(page, locale);
          await expectSingleScreen(page, { primary: journeyPage.primary(page, t), floor: false });
        });
      }
    });
  });
}
