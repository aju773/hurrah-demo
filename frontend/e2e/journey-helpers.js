// Shared pieces of the scripted demo runs (e2e/journey.spec.js): a reset of the
// demo state, the demo files, the customer's and staff's steps, and the checks
// every run makes (no money anywhere, no console errors).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test as base, expect } from "@playwright/test";

export { expect };

const BACKEND_DIR = path.resolve(__dirname, "../../backend");
const FIXTURE_DIR = path.resolve(__dirname, "fixtures/generated");
const MESSAGES = Object.fromEntries(
  ["en", "ar"].map((locale) => [locale, JSON.parse(fs.readFileSync(path.resolve(__dirname, `../messages/${locale}.json`), "utf8"))]),
);

/** The demo files, by the story they tell (documented in docs/demo-files.md). */
export const DEMO_FILES = {
  printReady: path.join(FIXTURE_DIR, "f2-omar-a5-clean.pdf"),
  needsFixing: path.join(FIXTURE_DIR, "f1-layla-a4-no-bleed.pdf"),
  protected: path.join(FIXTURE_DIR, "f3-password-protected.pdf"),
  damaged: path.join(FIXTURE_DIR, "f4-damaged-repairable.pdf"),
  fivePages: path.join(FIXTURE_DIR, "f5-five-pages-flyer-on-3-and-4.pdf"),
};

export const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  phone: { width: 390, height: 844 },
};

/** The site's own words in one language: `copy("ApproveAndConfirmStep", "submit")`.
 * Text with {placeholders} comes back as a regular expression that matches its
 * fixed start, so a button such as "Confirm — switch to {file}" can be found. */
export function copyFor(locale) {
  const text = (namespace, key) => {
    const value = MESSAGES[locale][namespace]?.[key];
    if (value === undefined) throw new Error(`No ${locale} copy for ${namespace}.${key}`);
    return value;
  };
  const words = (namespace, key) => text(namespace, key);
  words.startsWith = (namespace, key) => {
    const value = text(namespace, key);
    const fixed = value.split("{")[0].trim();
    return new RegExp(`^${fixed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  };
  // Text with simple {placeholders} filled in: `copy.with("PagePicker", "useAsFront", { page: 3 })`.
  words.with = (namespace, key, values) => text(namespace, key).replace(/\{(\w+)\}/g, (_, name) => String(values[name]));
  return words;
}

/** Puts the demo back to a clean start against the journey backend: no Orders,
 * uploads or Design requests, numbering at HUR-10001, the clock on a Tuesday
 * 09:30 Dubai. Same command the presenter runs. */
export function resetDemo() {
  const env = { ...process.env, SQLITE_PATH: "/tmp/hurrah-e2e-journey.sqlite3", MEDIA_ROOT: "/tmp/hurrah-e2e-journey-media" };
  execFileSync(path.join(BACKEND_DIR, "venv/bin/python"), ["manage.py", "reset_demo", "--noinput", "--fix-clock"], {
    cwd: BACKEND_DIR,
    env,
    stdio: "pipe",
  });
}

// Words that would mean money or payment reached the screen, in both languages.
const MONEY_WORDS = /\bAED\b|\bVAT\b|\btotal\b|\bprice|\bquote\b|\bpay(ment)?\b|\bsubtotal\b|درهم|ضريبة|الإجمالي|السعر|الدفع|عرض السعر/i;

/** No AED, VAT, total, price or payment text on the page as it is now. */
export async function expectNoMoney(page) {
  const text = await page.locator("body").innerText();
  const found = text.match(MONEY_WORDS);
  expect(found, `money text on ${page.url()}: "${found?.[0]}"`).toBeNull();
}

/** `test` with two extras on every page: hints off (scripted runs, as the Hints
 * flag allows; a run about the hints themselves sets `hintsOn`) and a failure if
 * the page logs a console error or throws.
 *
 * A run that uploads a file the demo refuses on purpose sets
 * `refusedUploadsExpected`: the browser then logs the refusal's 4xx as a console
 * error by itself, so that one line is let through (the page's own message is
 * still checked on screen). */
export const test = base.extend({
  refusedUploadsExpected: [false, { option: true }],
  hintsOn: [false, { option: true }],
  page: async ({ page, refusedUploadsExpected, hintsOn }, provide) => {
    const problems = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const refusedUpload = message.location().url.endsWith("/api/artworks/") && /status of 4\d\d/.test(message.text());
      if (refusedUpload && refusedUploadsExpected) return;
      problems.push(`console.error: ${message.text()}`);
    });
    page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`));
    if (!hintsOn) {
      await page.addInitScript(() => {
        window.__HURRAH_HINTS__ = false;
      });
    }
    await provide(page);
    expect(problems, "unhandled console errors").toEqual([]);
  },
});

/** Staff's side: signs in to the Django admin in its own browser context and
 * moves the Order (`Pass`, `Out for delivery`, …) by its number. */
export async function staffMovesOrder(browser, testInfo, number, moveLabel) {
  const { apiUrl, admin } = testInfo.project.metadata;
  const context = await browser.newContext();
  try {
    const staff = await context.newPage();
    await staff.goto(`${apiUrl}/admin/login/?next=/admin/orders/order/`);
    await staff.getByLabel("Username").fill(admin.user);
    await staff.getByLabel("Password").fill(admin.password);
    await staff.getByRole("button", { name: "Log in" }).click();
    await staff.getByRole("link", { name: number }).click();
    await expect(staff.getByText(/^Status:/)).toBeVisible();
    await staff.getByRole("button", { name: moveLabel }).click();
    await expect(staff.locator(".messagelist")).toContainText(number);
  } finally {
    await context.close();
  }
}

export async function uploadFront(page, file) {
  await page.locator('input[type="file"]').first().setInputFiles(file);
}

/** Every step is checked the same way: no money on the page, and on a phone no
 * sideways scroll. */
export async function checkPage(page, size) {
  await expectNoMoney(page);
  if (size === "phone") {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `sideways scroll of ${overflow}px on ${page.url()}`).toBeLessThanOrEqual(0);
  }
}

/** The Artwork page's Continue to Approve & confirm. */
export async function continueToApproval(page, t) {
  await page.getByRole("button", { name: t("FlyersConfigurator", "continue") }).click();
  await expect(page.getByRole("button", { name: t("ApproveAndConfirmStep", "submit") })).toBeVisible();
}

/** Step 3: contact details, every approval box, submit. Lands on the confirmation
 * page and returns the Order number. */
export async function approveAndSubmit(page, t, locale) {
  await page.getByLabel(t("ApproveAndConfirmStep", "fieldName")).fill("Layla Hassan");
  await page.getByLabel(t("ApproveAndConfirmStep", "fieldMobile")).fill("+971501234567");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: t("ApproveAndConfirmStep", "submit") }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/order/`));
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toContainText(/HUR-\d+/);
  return (await heading.innerText()).match(/HUR-\d+/)[0];
}
