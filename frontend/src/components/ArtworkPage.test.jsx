import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import ArtworkPage from "./ArtworkPage";
import { fetchPreview } from "@/lib/preview";
import { resetHints } from "@/lib/hints";

vi.mock("@/lib/preview", () => ({ fetchPreview: vi.fn() }));
vi.mock("./ArtworkPreview", () => ({ default: () => <div data-testid="proof" /> }));
vi.mock("./ArtworkSlots", () => ({ default: () => <div data-testid="slots" /> }));
vi.mock("./ArtworkTemplatesPanel", () => ({ default: ({ open }) => (open ? <div data-testid="templates-drawer" /> : null) }));
vi.mock("./DesignHelpDrawer", () => ({ default: () => null }));
vi.mock("./SyncDialog", () => ({ default: () => null }));
vi.mock("./SummaryPanel", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });

beforeEach(() => {
  localStorage.clear();
  resetHints();
});

afterEach(() => {
  cleanup();
  delete window.__HURRAH_HINTS__;
  vi.mocked(fetchPreview).mockReset();
});

const finding = (o) => ({ code: "font_not_embedded", severity: "error", bbox: null, message: "", ...o });
const preview = (findings) => ({
  ordered_trim_mm: [148, 210],
  product_bleed_mm: 3,
  product_safe_mm: 5,
  front: { image_url: "/f.png", findings },
  back: { same_as_front: true },
});

function render_(locale, front) {
  return show({ locale, front });
}

function show({ rotate = { front: false, back: false }, rotateAction = vi.fn(), front = { id: 1 }, canContinue = Boolean(front), dialog = null, locale = "en", onContinue = vi.fn(), backDropped = false, quote = null, editOptions = vi.fn(), back = null, sameBack = !back, swap = false, swapAction = vi.fn(), canChoosePages = {}, openChoosePages = vi.fn(), clock = undefined, clockNotice = false, clockExpire = vi.fn() } = {}) {
  const state = { commerceEnabled: Boolean(quote), quote, clock, notices: [], backDropped, previews: {}, sizeChoice: null, rotate, swap, slots: { front, back, sameBack } };
  const { unmount } = render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <ArtworkPage
        catalogue={{ product_id: 1, options: [{ code: "turnaround", name: "Turnaround", values: [{ code: "same-day", label: "Same-day" }] }] }}
        selection={{ size: "a5", turnaround: "same-day" }}
        state={state}
        locale={locale}
        dialog={dialog}
        canContinue={canContinue}
        artworkResetKey={0}
        designHelpOpen={false}
        configurationLine="A5 · 500 · Standard"
        syncBanner={null}
        reopenPicker={null}
        clockNotice={clockNotice}
        actions={{ onClockExpire: clockExpire, canChoosePages, openChoosePages, onContinue, editOptions, rotate: rotateAction, swap: swapAction }}
      />
    </NextIntlClientProvider>
  );
  return { unmount, clockExpire, onContinue, editOptions, rotateAction, swapAction, openChoosePages };
}

describe("the Artwork page's findings, preview and Continue", () => {
  it("shows no findings or preview before a Front is uploaded, and says why Continue is off", () => {
    show({ front: null });
    expect(fetchPreview).not.toHaveBeenCalled();
    const next = screen.getByRole("button", { name: "Continue" });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription(en.FlyersConfigurator.continueNeedsArtwork);
  });

  for (const locale of ["en", "ar"]) {
    it(`shows Findings and the preview once a Front is uploaded, and Continue is enabled when none is an Error (${locale})`, async () => {
      const m = locale === "ar" ? ar : en;
      vi.mocked(fetchPreview).mockResolvedValue(preview([finding({ severity: "warning", code: "low_ppi" })]));
      const { onContinue } = show({ locale });
      expect((await screen.findAllByTestId("proof")).length).toBeGreaterThan(0);
      expect(screen.getByText(new RegExp(`^${m.ArtworkChecks.severityWarning} · `))).toBeInTheDocument();
      const next = screen.getByRole("button", { name: m.FlyersConfigurator.continue });
      expect(next).toBeEnabled();
      fireEvent.click(next);
      expect(onContinue).toHaveBeenCalledTimes(1);
    });
  }

  it("disables Continue while a Finding is an Error, in text tied to the button", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(preview([finding()]));
    show();
    const next = screen.getByRole("button", { name: "Continue" });
    await vi.waitFor(() => expect(next).toBeDisabled());
    expect(next).toHaveAccessibleDescription(en.FlyersConfigurator.continueHasError);
  });

  it("disables Continue while a dialog is open", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(preview([]));
    show({ dialog: { key: "size:a4:a5" }, canContinue: false });
    const next = screen.getByRole("button", { name: "Continue" });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription(en.FlyersConfigurator.continueHasOpenDialog);
  });
});

describe("the Artwork page's Rotate control", () => {
  it("offers Rotate for the Front, hands the turn to the page's action, and previews with it applied", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(preview([]));
    const { rotateAction } = show({ rotate: { front: true, back: true } });
    fireEvent.click(await screen.findByRole("button", { name: "Undo rotate Front" }));
    expect(rotateAction).toHaveBeenCalledWith("front");
    // the Back is the Front again here, so it turns with the Front (draftOrder.rotatedSides)
    expect(fetchPreview).toHaveBeenCalledWith(expect.objectContaining({ rotate: { front: true, back: true } }));
  });

  it("keeps Continue available after a turn: rotating is not an Error", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(preview([]));
    show({ rotate: { front: true, back: false } });
    expect(await screen.findByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("the Artwork page's Swap control", () => {
  const twoSides = { back: { id: 2 }, sameBack: false };
  const bothPreview = { ...preview([]), back: { same_as_front: false, image_url: "/b.png", findings: [] } };

  it("is offered only when both a Front and a Back exist", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(preview([]));
    show(); // the Back is the Front again
    await screen.findAllByTestId("proof");
    expect(screen.queryByRole("button", { name: /Swap/ })).toBeNull();
    cleanup();
    vi.mocked(fetchPreview).mockResolvedValue({ ...preview([]), back: null });
    show({ back: null, sameBack: false }); // no Back yet
    await screen.findAllByTestId("proof");
    expect(screen.queryByRole("button", { name: /Swap/ })).toBeNull();
    cleanup();
    vi.mocked(fetchPreview).mockResolvedValue(bothPreview);
    show(twoSides);
    expect(await screen.findByRole("button", { name: "Swap Front and Back" })).toBeInTheDocument();
  });

  it("hands the swap to the page's action and previews with it applied", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(bothPreview);
    const { swapAction } = show({ ...twoSides, swap: true });
    expect(await screen.findByText(en.ArtworkChecks.swapNote)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo swap" }));
    expect(swapAction).toHaveBeenCalledTimes(1);
    expect(fetchPreview).toHaveBeenCalledWith(expect.objectContaining({ frontId: 1, backId: 2, swap: true }));
  });

  it("says nothing about a swap that is not on", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(bothPreview);
    show(twoSides);
    await screen.findByRole("button", { name: "Swap Front and Back" });
    expect(screen.queryByText(en.ArtworkChecks.swapNote)).toBeNull();
  });

  it("keeps Continue available after a swap: swapping is not an Error", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(bothPreview);
    show({ ...twoSides, swap: true });
    expect(await screen.findByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("Choose pages on a shown side opens the picker for the file behind it", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(bothPreview);
    const { openChoosePages } = show({ ...twoSides, swap: true, canChoosePages: { front: false, back: true } });
    // only the uploaded Back has pages to choose; it is shown as Front now
    fireEvent.click(await screen.findByRole("button", { name: en.ArtworkChecks.choosePages }));
    expect(openChoosePages).toHaveBeenCalledWith("back");
  });
});

describe("the Artwork page's Summary and Options-change notices", () => {
  beforeEach(() => vi.mocked(fetchPreview).mockResolvedValue(preview([])));

  it("shows a Summary bar at narrow widths that expands and collapses", () => {
    show();
    const bar = screen.getByRole("button", { name: new RegExp(en.FlyersConfigurator.summary) });
    expect(bar).toHaveAttribute("aria-expanded", "false");
    expect(bar).toHaveTextContent("A5 · 500 · Standard");
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(bar);
    expect(bar).toHaveAttribute("aria-expanded", "false");
  });

  it("puts the Quote total on the bar when the Commerce switch is on", () => {
    show({ quote: { total_aed: "1234.00" } });
    expect(screen.getByRole("button", { name: new RegExp(en.FlyersConfigurator.summary) })).toHaveTextContent("AED 1234.00");
  });

  it("Edit options goes back to the Options page", () => {
    const { editOptions } = show();
    fireEvent.click(screen.getByRole("button", { name: "Edit options" }));
    expect(editOptions).toHaveBeenCalledTimes(1);
  });

  it("Artwork templates opens from a button, reachable with no Artwork uploaded yet", () => {
    show({ front: null });
    expect(screen.queryByTestId("templates-drawer")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Artwork templates" }));
    expect(screen.getByTestId("templates-drawer")).toBeInTheDocument();
  });

  for (const locale of ["en", "ar"]) {
    it(`says why the Back slot went after single-sided was chosen (${locale})`, () => {
      const m = locale === "ar" ? ar : en;
      show({ backDropped: true, locale });
      expect(screen.getByText(m.FlyersConfigurator.backDroppedNotice)).toBeInTheDocument();
    });
  }

  it("says nothing when no Back was dropped", () => {
    show();
    expect(screen.queryByText(en.FlyersConfigurator.backDroppedNotice)).not.toBeInTheDocument();
  });
});

function tick(seconds) {
  for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
}

describe("the Cut-off clock on the Artwork page", () => {
  const CLOCK = { now: "n1", seconds_to_cutoff: 2, cutoff_time: "11:00", promised_date: "2026-09-22", window_start: "15:00", window_end: "20:00" };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchPreview).mockResolvedValue(preview([]));
  });
  afterEach(() => vi.useRealTimers());

  it("shows only a small Cut-off line, not a countdown", () => {
    show({ clock: CLOCK });
    expect(document.body.textContent).toContain("Same-day: order by 11:00");
    expect(screen.queryByText(/Approve in/)).toBeNull();
  });

  it("re-checks the Turnaround when the Cut-off passes, and keeps the customer on the page", () => {
    const { clockExpire, editOptions } = show({ clock: CLOCK });
    tick(2);
    expect(clockExpire).toHaveBeenCalled();
    expect(editOptions).not.toHaveBeenCalled();
    expect(screen.getByTestId("slots")).toBeInTheDocument();
  });

  it("says the promised date moved after an expiry", () => {
    show({ clock: CLOCK, clockNotice: true });
    expect(screen.getByText(en.FlyersConfigurator.clockMovedNotice)).toBeInTheDocument();
  });

  it("shows no Cut-off line before the clock has loaded", () => {
    show({});
    expect(screen.queryByText(/order by/)).toBeNull();
  });
});

describe("the Artwork page's Hint", () => {
  for (const locale of ["en", "ar"]) {
    it(`shows one Hint for the whole page, before and after a Front is uploaded (${locale})`, async () => {
      const m = locale === "ar" ? ar : en;
      const { unmount } = render_(locale, null);
      expect(document.querySelectorAll("[data-hint]")).toHaveLength(1);
      expect(screen.getByText(m.Hints.artwork)).toBeInTheDocument();
      unmount();
      vi.mocked(fetchPreview).mockResolvedValue(preview([finding({ severity: "warning", code: "low_ppi" })]));
      render_(locale, { id: 1 });
      await screen.findAllByTestId("proof");
      expect(document.querySelectorAll("[data-hint]")).toHaveLength(1);
      expect(document.querySelector('[data-hint="artwork"]')).toBeInTheDocument();
    });
  }

  it("does not block the page: Continue still works with the Hint up, and dismissing is remembered", async () => {
    vi.mocked(fetchPreview).mockResolvedValue(preview([]));
    const { onContinue } = show();
    await screen.findAllByTestId("proof");
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: en.Hints.gotIt }));
    expect(document.querySelector("[data-hint]")).toBeNull();
    cleanup();
    show();
    expect(document.querySelector("[data-hint]")).toBeNull();
    // "Show hints" lives in the shared header (ticket 02), not on this page:
    // bringing hints back is exercised there; this only proves the page's own
    // Hint slot reacts once they are back on.
    act(() => resetHints());
    expect(document.querySelector('[data-hint="artwork"]')).toBeInTheDocument();
  });

  it("shows no Hint when the runtime flag is off", () => {
    window.__HURRAH_HINTS__ = false;
    show({ front: null });
    expect(document.querySelector("[data-hint]")).toBeNull();
  });
});
