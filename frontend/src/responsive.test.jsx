import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import ArtworkSlot from "@/components/ArtworkSlot";
import PagePicker from "@/components/PagePicker";
import SyncDialog from "@/components/SyncDialog";
import SiteHeader from "@/components/SiteHeader";
import { ShowHintsLink } from "@/components/FirstVisitHint";
import LocaleControls from "@/components/LocaleControls";
import OptionsPage from "@/components/OptionsPage";
import ArtworkPage from "@/components/ArtworkPage";
import ApproveAndConfirmStep from "@/components/ApproveAndConfirmStep";
import { fetchPreview } from "@/lib/preview";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, locale, ...props }) => <a href="#top" {...props} />, // eslint-disable-line no-unused-vars
  usePathname: () => "/flyers",
}));
vi.mock("@/lib/preview", () => ({ fetchPreview: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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
  it("is one slim row with the logo home and the language toggle, at every width", () => {
    const { container } = render(withIntl(<SiteHeader />));
    const header = container.querySelector("header");
    expect(classes(header)).toEqual(expect.arrayContaining(["flex", "items-center", "justify-between"]));
    expect(screen.getByRole("link", { name: en.SiteHeader.brand })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: en.LanguageToggle.label })).toBeInTheDocument();
    expect(untapped(container)).toEqual([]);
  });

  it("has no search, category menu, nav links or cart that go nowhere", () => {
    const { container } = render(withIntl(<SiteHeader />));
    expect(container.querySelector("input, nav, img")).toBeNull();
  });

  it("works in Arabic too", () => {
    render(withIntl(<SiteHeader />, "ar"));
    expect(screen.getByRole("link", { name: ar.SiteHeader.brand })).toBeInTheDocument();
    expect(screen.getByText(ar.LanguageToggle.draftTranslation)).toBeInTheDocument();
  });
});

// The journey's pages at 390px (ticket 09). jsdom has no layout, so these pin the
// markup the browser applies: every control a floor of 44px, the Summary a bar that
// expands instead of a column, wide content scrolling inside itself rather than the page.
const CATALOGUE = {
  product_id: 1,
  options: [
    { code: "quantity", name: "Quantity", values: [{ code: "500", label: "500" }, { code: "1000", label: "1,000" }] },
    { code: "sides", name: "Sides", values: [{ code: "single", label: "Single" }, { code: "double", label: "Double" }] },
    { code: "turnaround", name: "Turnaround", values: [{ code: "standard", label: "Standard" }, { code: "same-day", label: "Same-day" }] },
  ],
};
const SELECTION = { quantity: "500", sides: "single", turnaround: "standard" };
const CLOCK = { now: "n1", seconds_to_cutoff: 5400, cutoff_time: "11:00", promised_date: "2026-09-22", window_start: "15:00", window_end: "20:00" };
const QUOTE = { base_aed: 100, uplifts: [], subtotal_aed: 100, vat_aed: 5, total_aed: 105, per_piece_aed: 0.21 };
const baseState = (commerceEnabled) => ({
  commerceEnabled,
  quote: commerceEnabled ? QUOTE : null,
  notices: [],
  blocked: {},
  priceGrid: commerceEnabled ? [{ quantity: "500", cells: [{ quantity: "500", turnaround: "standard", quote: QUOTE }, { quantity: "500", turnaround: "same-day", blocked: true, reason: "Not available" }] }] : [],
  clock: CLOCK,
  turnarounds: [{ code: "standard", ...CLOCK }, { code: "same-day", ...CLOCK }],
  available: true,
  previews: {},
  sizeChoice: null,
  rotate: { front: false, back: false },
  swap: false,
});

describe("the Options page on a phone", () => {
  for (const commerceEnabled of [false, true]) {
    it(`every control is 44px and the Price grid scrolls inside itself (Commerce ${commerceEnabled ? "on" : "off"})`, () => {
      const { container } = render(
        withIntl(<OptionsPage catalogue={CATALOGUE} selection={SELECTION} state={baseState(commerceEnabled)} locale="en" syncBanner={null} clockNotice={false} onPick={vi.fn()} onClockExpire={vi.fn()} onStart={vi.fn()} />)
      );
      expect(screen.getByRole("button", { name: "Start ordering" })).toBeInTheDocument();
      expect(untapped(container).filter((el) => !el.closest(".tap"))).toEqual([]);
      if (commerceEnabled) expect(classes(container.querySelector("table").parentElement)).toContain("overflow-x-auto");
    });
  }
});

describe("the Artwork page on a phone", () => {
  function showArtwork({ front = { id: 1 }, commerceEnabled = false } = {}) {
    vi.mocked(fetchPreview).mockResolvedValue({
      ordered_trim_mm: [148, 210],
      product_bleed_mm: 3,
      product_safe_mm: 5,
      front: { image_url: "/f.png", findings: [] },
      back: { same_as_front: true },
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ templates: [], guide: {} }) })));
    const state = { ...baseState(commerceEnabled), slots: { front, back: null, sameBack: true } };
    return render(
      withIntl(
        <ArtworkPage
          catalogue={CATALOGUE}
          selection={SELECTION}
          state={state}
          locale="en"
          dialog={null}
          canContinue
          artworkResetKey={0}
          designHelpOpen={false}
          configurationLine="A5 · 500 · Standard"
          syncBanner={null}
          reopenPicker={null}
          clockNotice={false}
          actions={{ onClockExpire: vi.fn(), canChoosePages: {}, openChoosePages: vi.fn(), onContinue: vi.fn(), editOptions: vi.fn(), rotate: vi.fn(), swap: vi.fn() }}
        />
      )
    );
  }

  it("the Summary is a labelled bar above the upload that expands, and a panel from lg up", () => {
    showArtwork({ commerceEnabled: true });
    const bar = screen.getByRole("button", { name: /Summary/ });
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(bar).toHaveAttribute("aria-controls", "summary-panel");
    expect(classes(bar)).toEqual(expect.arrayContaining(["lg:hidden", "min-h-[44px]"]));
    const panel = document.getElementById("summary-panel");
    expect(classes(panel)).toEqual(expect.arrayContaining(["hidden", "lg:block"]));
    expect(classes(panel.parentElement)).toEqual(expect.arrayContaining(["order-first", "lg:order-none"]));
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    expect(classes(document.getElementById("summary-panel"))).toContain("block");
  });

  it("every control is 44px, with visible labels on Edit options, Rotate and Swap", async () => {
    const { container } = showArtwork();
    await screen.findByRole("button", { name: /Rotate/ });
    expect(screen.getByRole("button", { name: "Edit options" })).toBeInTheDocument();
    await waitFor(() => expect(untapped(container).filter((el) => !el.closest(".tap")).map((el) => el.textContent.trim() || el.getAttribute("aria-label"))).toEqual([]));
  });
});

describe("the Approve page on a phone", () => {
  it("every control is 44px", async () => {
    vi.mocked(fetchPreview).mockResolvedValue({ ordered_trim_mm: [148, 210], product_bleed_mm: 3, product_safe_mm: 5, front: { image_url: "/f.png", findings: [] }, back: { same_as_front: true } });
    const { container } = render(
      withIntl(
        <ApproveAndConfirmStep
          catalogue={{ options: [{ code: "size", name: "Size", values: [{ code: "a5", label: "A5" }] }] }}
          selection={{ size: "a5", turnaround: "standard" }}
          quote={null}
          commerceEnabled={false}
          clock={CLOCK}
          frontId={1}
          backId={null}
          sameAsFront
          sizeCode="a5"
          sizeChoice={null}
          ticks={{ approval: false, warnings: false }}
          onSetTick={vi.fn()}
          onClockExpire={vi.fn()}
          browsingLanguage="en"
          locale="en"
          idempotencyKey="k"
          onBack={vi.fn()}
          onSubmitted={vi.fn()}
        />
      )
    );
    await waitFor(() => expect(container.querySelector("input[type=checkbox]")).not.toBeNull());
    expect(untapped(container).filter((el) => !el.closest(".tap")).map((el) => el.textContent.trim() || el.name || el.type)).toEqual([]);
  });
});
