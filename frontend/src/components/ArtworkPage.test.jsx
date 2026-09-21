import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function show({ front = { id: 1 }, canContinue = Boolean(front), dialog = null, locale = "en", onContinue = vi.fn() } = {}) {
  const state = { commerceEnabled: false, notices: [], previews: {}, sizeChoice: null, slots: { front, back: null, sameBack: true } };
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
        configurationLine=""
        syncBanner={null}
        reopenPicker={null}
        actions={{ canChoosePages: {}, onContinue }}
      />
    </NextIntlClientProvider>
  );
  return onContinue;
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
      const onContinue = show({ locale });
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
