import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import ArtworkSlot from "@/components/ArtworkSlot";
import PagePicker from "@/components/PagePicker";
import SyncDialog from "@/components/SyncDialog";
import SiteHeader from "@/components/SiteHeader";
import { ShowHintsLink } from "@/components/FirstVisitHint";
import LocaleControls from "@/components/LocaleControls";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, locale, ...props }) => <a href="#top" {...props} />, // eslint-disable-line no-unused-vars
  usePathname: () => "/flyers",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

// jsdom has no layout, so these pin the phone rules in the markup: the classes
// that make a dialog full-screen and a target 44px are what the browser applies.
const withIntl = (ui, locale = "en") => (
  <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
    {ui}
  </NextIntlClientProvider>
);
const classes = (el) => el.className.split(/\s+/);
const untapped = (root) => [...root.querySelectorAll("button, a[href], input:not([type=hidden]):not([type=file])")].filter((el) => !classes(el).includes("tap"));

const page = (number) => ({ number, matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210, orientation: "portrait", thumbnail_url: `http://x/${number}.png` });
const SOURCE = { id: 7, page_count: 2, original_filename: "menu.pdf", pages: [page(1), page(2)] };

describe("dialogs are full-screen on a phone", () => {
  it("Page picker fills the screen below sm and floats above it", () => {
    render(withIntl(<PagePicker source={SOURCE} orderedSize="a5" onConfirm={vi.fn()} onCancel={vi.fn()} />));
    const dialog = screen.getByRole("dialog", { name: "Choose your flyer pages" });
    expect(classes(dialog)).toEqual(expect.arrayContaining(["h-full", "w-full", "sm:h-auto", "sm:rounded-[16px]"]));
    expect(classes(dialog)).not.toContain("rounded-[16px]");
    expect(classes(dialog.parentElement)).toEqual(expect.arrayContaining(["items-stretch", "sm:p-[16px]"]));
    expect(classes(dialog.parentElement)).not.toContain("p-[16px]");
  });

  it("enlarged page inside the picker is full-screen on a phone", () => {
    render(withIntl(<PagePicker source={SOURCE} orderedSize="a5" onConfirm={vi.fn()} onCancel={vi.fn()} />));
    fireEvent.click(screen.getAllByRole("button", { name: /enlarge|page 1/i }).find((b) => b.querySelector("img")));
    const enlarged = screen.getAllByRole("dialog").at(-1);
    expect(classes(enlarged)).toEqual(expect.arrayContaining(["h-full", "w-full"]));
    expect(classes(enlarged.parentElement)).not.toContain("p-[16px]");
  });

  it("size and side dialogs fill the screen on a phone", () => {
    render(
      withIntl(
        <SyncDialog
          dialog={{ key: "sides:double", kind: "front-only", field: "sides", file: "single", ordered: "double" }}
          preview={null}
          onPreviewSwitch={vi.fn()}
          onResolve={vi.fn()}
          sizeValues={[]}
          productBleedMm={3}
          productSafeMm={5}
          fileTrimMm={null}
          fileBleedMm={0}
          fileImageUrl={null}
          commerceEnabled={false}
        />
      )
    );
    const dialog = screen.getByRole("dialog");
    expect(classes(dialog)).toEqual(expect.arrayContaining(["h-full", "w-full", "sm:h-auto"]));
    expect(classes(dialog.parentElement)).not.toContain("p-[16px]");
    expect(untapped(dialog)).toEqual([]);
  });
});

describe("tap targets are at least 44px on a phone", () => {
  it("the page picker's buttons and checkbox row", () => {
    render(withIntl(<PagePicker source={SOURCE} orderedSize="a5" onConfirm={vi.fn()} onCancel={vi.fn()} />));
    const dialog = screen.getByRole("dialog");
    const controls = [...dialog.querySelectorAll("button")].filter((b) => /Use page|Cancel|Use these/.test(b.textContent + b.getAttribute("aria-label")));
    expect(controls.length).toBeGreaterThan(3);
    for (const control of controls) expect(classes(control)).toContain("tap");
  });

  it("a finished upload's Remove and Choose pages links", () => {
    render(
      withIntl(
        <ArtworkSlot id="s" label="Front" status="ok" fileName="a.pdf" artwork={{ is_valid: true, matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210, preflight_report: { headline_severity: "ok", findings: [] } }} error={null} onFile={vi.fn()} onRemove={vi.fn()} onChoosePages={vi.fn()} />
      )
    );
    expect(screen.getAllByRole("button").length).toBe(2);
    expect(untapped(screen.getByRole("group"))).toEqual([]);
  });

  it("Show hints and the language toggle", () => {
    const { container } = render(withIntl(<><ShowHintsLink /><LocaleControls /></>));
    expect(screen.getByRole("button", { name: en.Hints.show })).toBeInTheDocument();
    expect(untapped(container)).toEqual([]);
  });
});

describe("choosing a file on a phone", () => {
  it("the file input accepts a PDF by type and by extension, so phone storage and cloud apps offer it", () => {
    const { container } = render(withIntl(<ArtworkSlot id="s" label="Front" status="empty" fileName="" artwork={null} error={null} onFile={vi.fn()} onRemove={vi.fn()} />));
    const accept = container.querySelector('input[type="file"]').getAttribute("accept").split(",");
    expect(accept).toEqual(expect.arrayContaining(["application/pdf", ".pdf"]));
  });
});

describe("site header", () => {
  it("has a phone header and hides the desktop one below lg, so nothing runs off the screen", () => {
    const { container } = render(withIntl(<SiteHeader />));
    const [phone, desktop] = container.children;
    expect(classes(phone)).toContain("lg:hidden");
    expect(classes(desktop)).toEqual(expect.arrayContaining(["hidden", "lg:block"]));
  });

  it("keeps the phone header's cart behind the Commerce switch", () => {
    const off = render(withIntl(<SiteHeader />)).container;
    expect(off.querySelector('.lg\\:hidden img[alt="cart"]')).toBeNull();
    cleanup();
    const on = render(withIntl(<SiteHeader commerceEnabled />)).container;
    expect(on.querySelector('.lg\\:hidden img[alt="cart"]')).not.toBeNull();
  });

  it("works in Arabic too", () => {
    const { container } = render(withIntl(<SiteHeader />, "ar"));
    expect(container.querySelector(".lg\\:hidden")).toHaveTextContent(ar.SiteHeader.searchPlaceholder);
  });
});
