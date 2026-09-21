import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import ArtworkChecks from "./ArtworkChecks";
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
      <ArtworkChecks frontId={1} backId={null} sameAsFront sizeCode="a5" sizeChoice={null} />
    </NextIntlClientProvider>
  );
}

describe("ArtworkChecks when the preview can't be loaded", () => {
  for (const locale of ["en", "ar"]) {
    it(`says so and offers Retry, which asks again (${locale})`, async () => {
      const m = (locale === "ar" ? ar : en).ArtworkChecks;
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

describe("ArtworkChecks Rotate", () => {
  const TWO_SIDES = { ...PREVIEW, back: { same_as_front: false, findings: [], image_url: "/b.png", page_box_mm: [154, 216], file_trim_mm: [148, 210], file_bleed_mm: 3 } };

  function showRotate({ locale = "en", rotate = { front: false, back: false }, onRotate = vi.fn(), preview = TWO_SIDES } = {}) {
    vi.mocked(fetchPreview).mockResolvedValue(preview);
    render(
      <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
        <ArtworkChecks frontId={1} backId={2} sameAsFront={false} sizeCode="a5" sizeChoice={null} rotate={rotate} onRotate={onRotate} />
      </NextIntlClientProvider>
    );
    return onRotate;
  }

  for (const locale of ["en", "ar"]) {
    it(`has a labelled Rotate button for each side that asks the page to turn that side (${locale})`, async () => {
      const m = (locale === "ar" ? ar : en).ArtworkChecks;
      const onRotate = showRotate({ locale });
      const front = await screen.findByRole("button", { name: m.rotateSide.replace("{side}", m.front) });
      const back = screen.getByRole("button", { name: m.rotateSide.replace("{side}", m.back) });
      expect(front).toHaveTextContent(m.rotateSide.replace("{side}", m.front)); // the label is visible, not just a name
      fireEvent.click(front);
      expect(onRotate).toHaveBeenLastCalledWith("front");
      fireEvent.click(back);
      expect(onRotate).toHaveBeenLastCalledWith("back");
    });
  }

  it("becomes Undo rotate for a turned side", async () => {
    showRotate({ rotate: { front: true, back: false } });
    expect(await screen.findByRole("button", { name: "Undo rotate Front" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rotate Back" })).toBeInTheDocument();
  });

  it("asks for a preview that applies the rotation, and asks again when it changes", async () => {
    showRotate({ rotate: { front: true, back: false } });
    await screen.findAllByTestId("proof");
    expect(fetchPreview).toHaveBeenCalledWith(expect.objectContaining({ rotate: { front: true, back: false } }));
    cleanup();
    vi.mocked(fetchPreview).mockClear();
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArtworkChecks frontId={1} backId={2} sameAsFront={false} sizeCode="a5" sizeChoice={null} rotate={{ front: false, back: false }} onRotate={vi.fn()} />
      </NextIntlClientProvider>
    );
    await screen.findAllByTestId("proof");
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <ArtworkChecks frontId={1} backId={2} sameAsFront={false} sizeCode="a5" sizeChoice={null} rotate={{ front: true, back: false }} onRotate={vi.fn()} />
      </NextIntlClientProvider>
    );
    await vi.waitFor(() => expect(fetchPreview).toHaveBeenCalledTimes(2));
  });

  it("has no Rotate button of its own for a Back that is the Front again", async () => {
    showRotate({ preview: PREVIEW });
    await screen.findAllByTestId("proof");
    expect(screen.getAllByRole("button", { name: /Rotate/ })).toHaveLength(1);
  });
});
