// Single-screen fit check for the Options page with the Price grid (ticket 03):
// the Commerce switch is on in this ("priced") project's own backend, unlike the
// money-free "journey" project's scripted runs (journey-single-screen.spec.js),
// so this is where the fit check with the grid actually visible belongs.
import { test, expect, SINGLE_SCREEN_VIEWPORTS, copyFor, expectSingleScreen } from "./journey-helpers";

const LOCALES = ["en", "ar"];

for (const locale of LOCALES) {
  const t = copyFor(locale);

  test.describe(`Options page single-screen fit with the Price grid, ${locale}`, () => {
    for (const size of SINGLE_SCREEN_VIEWPORTS) {
      test.describe(`at ${size.width}x${size.height}`, () => {
        test.use({ viewport: size });

        test("fits the viewport with the Price grid visible", async ({ page }) => {
          await page.goto(`/${locale}/flyers`);
          const primary = page.getByRole("button", { name: t("FlyersConfigurator", "startOrdering"), exact: true });
          await expectSingleScreen(page, { primary });
          await expect(page.getByText(t("FlyersConfigurator", "priceGrid"))).toBeVisible();
        });
      });
    }
  });
}
