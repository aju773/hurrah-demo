import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import CheckAndPreviewStep from "./CheckAndPreviewStep";
import { fetchPreview } from "@/lib/preview";

vi.mock("@/lib/preview", () => ({ fetchPreview: vi.fn() }));
vi.mock("./ArtworkPreview", () => ({ default: () => <div data-testid="proof" /> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });

const PREVIEW = {
  ordered_trim_mm: [148, 210],
  product_bleed_mm: 3,
  product_safe_mm: 5,
  front: { same_as_front: false, findings: [], image_url: "/f.png", page_box_mm: [154, 216], file_trim_mm: [148, 210], file_bleed_mm: 3 },
  back: { same_as_front: true },
};

afterEach(() => {
  cleanup();
  vi.mocked(fetchPreview).mockReset();
});

function show(locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <CheckAndPreviewStep frontId={1} backId={null} sameAsFront sizeCode="a5" sizeChoice={null} onBack={vi.fn()} onNext={vi.fn()} />
    </NextIntlClientProvider>
  );
}

describe("CheckAndPreviewStep when the preview can't be loaded", () => {
  for (const locale of ["en", "ar"]) {
    it(`says so and offers Retry, which asks again (${locale})`, async () => {
      const m = (locale === "ar" ? ar : en).CheckAndPreviewStep;
      vi.mocked(fetchPreview).mockResolvedValueOnce(null).mockResolvedValue(PREVIEW);
      show(locale);
      expect(await screen.findByRole("alert")).toHaveTextContent(m.loadError);
      fireEvent.click(screen.getByRole("button", { name: m.retry }));
      expect((await screen.findAllByTestId("proof")).length).toBeGreaterThan(0);
      expect(fetchPreview).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  }
});
