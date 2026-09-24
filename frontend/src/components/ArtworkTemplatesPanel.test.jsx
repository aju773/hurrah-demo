import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import ArtworkTemplatesPanel from "./ArtworkTemplatesPanel";

const PAYLOAD = {
  templates: [
    { size_code: "a6", label: "A6", width_mm: 105, height_mm: 148, url: "http://api/products/flyers/templates/a6/" },
    { size_code: "a5", label: "A5", width_mm: 148, height_mm: 210, url: "http://api/products/flyers/templates/a5/" },
  ],
  guide: { bleed_mm: 3, safe_mm: 5, ppi_error_below: 150, ppi_warn_below: 250 },
};

function stubFetch(response = { ok: true, json: () => Promise.resolve(PAYLOAD) }) {
  const fetchMock = vi.fn(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function show({ locale = "en", messages = en, onClose = vi.fn() } = {}) {
  await act(async () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ArtworkTemplatesPanel open productSlug="flyers" onClose={onClose} />
      </NextIntlClientProvider>
    );
  });
  return { onClose };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArtworkTemplatesPanel", () => {
  it("renders nothing, and asks nothing, while closed", async () => {
    const fetchMock = stubFetch();
    await act(async () => {
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <ArtworkTemplatesPanel productSlug="flyers" onClose={vi.fn()} />
        </NextIntlClientProvider>
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens as a dialog and closes on its Close button", async () => {
    stubFetch();
    const { onClose } = await show();
    expect(screen.getByRole("dialog", { name: en.ArtworkTemplates.title })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: en.ArtworkTemplates.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks the server for the Product's templates in the browsing language", async () => {
    const fetchMock = stubFetch();
    await show({ locale: "ar", messages: ar });
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/products\/flyers\/templates\/\?locale=ar$/);
  });

  it("lists a download link for every Size the server offers", async () => {
    stubFetch();
    await show();
    const links = within(screen.getByRole("list", { name: "Artwork templates" })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(PAYLOAD.templates.map((t) => t.url));
    expect(links[1]).toHaveTextContent("A5");
    expect(links[1]).toHaveTextContent("148 × 210 mm");
  });

  it("writes the how-to-prepare guide from the Product's thresholds", async () => {
    stubFetch({ ok: true, json: () => Promise.resolve({ ...PAYLOAD, guide: { bleed_mm: 4, safe_mm: 6.5, ppi_error_below: 120, ppi_warn_below: 200 } }) });
    await show();
    const guide = screen.getByRole("list", { name: "How to prepare your file" });
    expect(guide).toHaveTextContent("4 mm");
    expect(guide).toHaveTextContent("6.5 mm");
    expect(guide).toHaveTextContent("200 ppi");
    expect(guide).toHaveTextContent("120 ppi");
    expect(guide).toHaveTextContent(/CMYK/);
    expect(guide).toHaveTextContent(/fonts/i);
  });

  it("shows the panel in Arabic", async () => {
    stubFetch();
    await show({ locale: "ar", messages: ar });
    expect(screen.getByRole("heading", { name: ar.ArtworkTemplates.title })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: ar.ArtworkTemplates.guideTitle })).toBeInTheDocument();
  });

  it("says so, and offers nothing broken, when the templates can't be loaded", async () => {
    stubFetch({ ok: false, json: () => Promise.resolve({}) });
    await show();
    expect(screen.getByRole("alert")).toHaveTextContent("Templates aren't available right now");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("offers Retry when the templates can't be loaded, and shows them once they can", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(PAYLOAD) });
    vi.stubGlobal("fetch", fetchMock);
    await show();
    expect(screen.getByRole("alert")).toHaveTextContent("Templates aren't available right now");
    await act(async () => screen.getByRole("button", { name: "Retry" }).click());
    expect(screen.getAllByRole("link").length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
