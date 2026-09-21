import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import ArtworkPage from "./ArtworkPage";
import { fetchPreview } from "@/lib/preview";

vi.mock("@/lib/preview", () => ({ fetchPreview: vi.fn() }));
vi.mock("./ArtworkPreview", () => ({ default: () => <div data-testid="proof" /> }));
vi.mock("./ArtworkSlots", () => ({ default: () => <div data-testid="slots" /> }));
vi.mock("./ArtworkTemplatesPanel", () => ({ default: () => null }));
vi.mock("./DesignHelpDrawer", () => ({ default: () => null }));
vi.mock("./SyncDialog", () => ({ default: () => null }));
vi.mock("./SummaryPanel", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });

afterEach(() => {
  cleanup();
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

function show({ rotate = { front: false, back: false }, rotateAction = vi.fn(), front = { id: 1 }, canContinue = Boolean(front), dialog = null, locale = "en", onContinue = vi.fn(), backDropped = false, quote = null, editOptions = vi.fn() } = {}) {
  const state = { commerceEnabled: Boolean(quote), quote, notices: [], backDropped, previews: {}, sizeChoice: null, rotate, slots: { front, back: null, sameBack: true } };
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <ArtworkPage
        catalogue={{ product_id: 1, options: [] }}
        selection={{ size: "a5" }}
        state={state}
        locale={locale}
        dialog={dialog}
        canContinue={canContinue}
        artworkResetKey={0}
        designHelpOpen={false}
        configurationLine="A5 · 500 · Standard"
        syncBanner={null}
        reopenPicker={null}
        actions={{ canChoosePages: {}, onContinue, editOptions, rotate: rotateAction }}
      />
    </NextIntlClientProvider>
  );
  return { onContinue, editOptions, rotateAction };
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
