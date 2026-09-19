import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import axe from "axe-core";
import en from "../messages/en.json";
import ar from "../messages/ar.json";
import ArtworkSlot from "@/components/ArtworkSlot";
import CheckAndPreviewStep from "@/components/CheckAndPreviewStep";
import ApproveAndConfirmStep from "@/components/ApproveAndConfirmStep";
import EnlargedPreview from "@/components/EnlargedPreview";
import PagePicker from "@/components/PagePicker";
import SyncDialog from "@/components/SyncDialog";
import DesignHelpDrawer from "@/components/DesignHelpDrawer";
import ArtworkTemplatesPanel from "@/components/ArtworkTemplatesPanel";
import FirstVisitHint from "@/components/FirstVisitHint";
import { combineFindings } from "@/lib/findings";
import { fetchPreview } from "@/lib/preview";

// The automated accessibility check for each step of the journey (ticket 14): axe-core
// over the rendered step, in English and Arabic, failing on any serious or critical
// issue. jsdom has no layout or painting, so colour-contrast (checked separately in
// lib/contrast.test.js) and the page-level "region" rule are left out here.
vi.mock("@/lib/preview", () => ({ fetchPreview: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, locale, ...rest }) => <a href="#top" {...rest}>{children}</a>,
  usePathname: () => "/flyers",
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });

Element.prototype.getClientRects = function () {
  return [{}];
};

async function seriousViolations(container) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 120)).join(" | ")}`);
}

const withIntl = (ui, locale) => (
  <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
    <div dir={locale === "ar" ? "rtl" : "ltr"} lang={locale}>
      {ui}
    </div>
  </NextIntlClientProvider>
);

const finding = (overrides) => ({ code: "low_ppi", severity: "warning", value: 180, slot: undefined, page: 1, bbox: [10, 10, 40, 40], message: "", ...overrides });
const PREVIEW = {
  front: {
    image_url: "/front.png",
    thumbnail_url: "/front-t.png",
    findings: [finding({ code: "font_not_embedded", severity: "error", bbox: null }), finding(), finding({ code: "rgb_colour", severity: "note", bbox: null })],
  },
  back: { same_as_front: true },
  ordered_trim_mm: [148, 210],
  product_bleed_mm: 3,
  product_safe_mm: 5,
};
const CLOCK = { now: "n1", seconds_to_cutoff: 5400, promised_date: "2026-09-22", window_start: null, window_end: "20:00" };
const page = (number, code, w = 148, h = 210) => ({ number, matched_size_code: code, trim_width_mm: w, trim_height_mm: h, orientation: "portrait", thumbnail_url: `/p${number}.png` });

const STEPS = {
  "Step 1: empty upload slot": () => <ArtworkSlot id="s" label="Front" status="empty" fileName="" artwork={null} error={null} onFile={vi.fn()} onRemove={vi.fn()} onCancel={vi.fn()} onRetry={vi.fn()} />,
  "Step 1: uploading": () => <ArtworkSlot id="s" label="Front" status="uploading" fileName="a.pdf" progress={0.4} artwork={null} error={null} onFile={vi.fn()} onRemove={vi.fn()} onCancel={vi.fn()} onRetry={vi.fn()} />,
  "Step 1: checking": () => <ArtworkSlot id="s" label="Front" status="checking" fileName="a.pdf" artwork={null} error={null} onFile={vi.fn()} onRemove={vi.fn()} onCancel={vi.fn()} onRetry={vi.fn()} />,
  "Step 1: analysed": () => (
    <ArtworkSlot
      id="s"
      label="Front"
      status="ok"
      fileName="a.pdf"
      artwork={{ matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210, orientation: "portrait", bleed_mm: 3, trim_source: "trimbox", preflight: { findings: [] } }}
      error={null}
      onFile={vi.fn()}
      onRemove={vi.fn()}
      onCancel={vi.fn()}
      onRetry={vi.fn()}
      onChoosePages={vi.fn()}
    />
  ),
  "Step 1: upload error with Retry": () => <ArtworkSlot id="s" label="Front" status="error" fileName="a.pdf" artwork={null} error={{ code: "network_failed", message: null }} canRetry onFile={vi.fn()} onRemove={vi.fn()} onCancel={vi.fn()} onRetry={vi.fn()} />,
  "Step 1: artwork templates": () => <ArtworkTemplatesPanel />,
  "Step 1: first-visit hint": () => <FirstVisitHint step="options" />,
  "Step 1: size dialog": () => (
    <SyncDialog
      dialog={{ key: "size:a4", kind: "size-mismatch", field: "size", file: "a4", ordered: "a5" }}
      preview={{ status: "ready", notices: [{ reason: "Same-day is not available for A4." }] }}
      onPreviewSwitch={vi.fn()}
      onResolve={vi.fn()}
      sizeValues={[{ code: "a5", width_mm: 148, height_mm: 210 }]}
      productBleedMm={3}
      productSafeMm={5}
      fileTrimMm={[210, 297]}
      fileBleedMm={3}
      fileImageUrl="/f.png"
    />
  ),
  "Step 1: sides dialog": () => (
    <SyncDialog dialog={{ key: "sides:double", kind: "front-only", field: "sides", file: "single", ordered: "double" }} preview={{ status: "ready", notices: [] }} onPreviewSwitch={vi.fn()} onResolve={vi.fn()} />
  ),
  "Step 1: page picker": () => <PagePicker source={{ id: 7, page_count: 3, original_filename: "menu.pdf", pages: [page(1, "a4", 210, 297), page(2, "a5"), page(3, "a5")] }} orderedSize="a5" initialChoice={{ front: 2, back: 3, same: false }} onConfirm={vi.fn()} onCancel={vi.fn()} />,
  "Step 1: page picker with a refused choice": () => <PagePicker source={{ id: 7, page_count: 3, original_filename: "menu.pdf", pages: [page(1, "a4", 210, 297), page(2, "a5"), page(3, "a5")] }} orderedSize="a5" initialChoice={{ front: 2, back: 1, same: false }} error={{ code: "network_failed", message: "Network" }} onConfirm={vi.fn()} onCancel={vi.fn()} />,
  "Step 1: Need a design? drawer": () => <DesignHelpDrawer open onClose={vi.fn()} product={{ id: 1 }} configurationLine="A5 · 170gsm" configurationSnapshot={{}} />,
  "Step 2: check and preview": () => <CheckAndPreviewStep frontId={1} backId={null} sameAsFront sizeCode="a5" sizeChoice={null} onBack={vi.fn()} onNext={vi.fn()} canChoosePages={{ front: true }} onChoosePages={vi.fn()} />,
  "Step 2: enlarged preview": () => {
    const groups = combineFindings({ front: { findings: PREVIEW.front.findings }, back: null, sameAsFront: true });
    return <EnlargedPreview t={(k) => k} initialSlot="front" initialSelectedKey={groups[0].key} preview={PREVIEW} orderedTrimMm={[148, 210]} productBleedMm={3} productSafeMm={5} groups={groups} onClose={vi.fn()} />;
  },
  "Step 3: approve and confirm": () => (
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
  ),
};

describe("automated accessibility check: no serious or critical issues", () => {
  for (const locale of ["en", "ar"]) {
    for (const [name, build] of Object.entries(STEPS)) {
      it(`${name} (${locale})`, async () => {
        vi.mocked(fetchPreview).mockResolvedValue(PREVIEW);
        vi.stubGlobal(
          "fetch",
          vi.fn(async (url) =>
            String(url).includes("/templates/")
              ? { ok: true, json: async () => ({ templates: [{ size_code: "a5", label: "A5", width_mm: 148, height_mm: 210, url: "/t/a5.pdf" }], guide: { bleed_mm: 3, safe_mm: 5, ppi_warn_below: 200, ppi_error_below: 100 } }) }
              : { ok: true, json: async () => ({ whatsapp_number: "971500000000" }) }
          )
        );
        const { container } = render(withIntl(build(), locale));
        // Async steps (preview, templates) settle before the scan.
        if (name.startsWith("Step 2: check")) await screen.findAllByText(/Must fix|يجب/);
        if (name.includes("templates")) await waitFor(() => expect(container.querySelector("section")).not.toBeNull());
        if (name.includes("approve")) await waitFor(() => expect(container.querySelector("input[type=checkbox]")).not.toBeNull());
        expect(await seriousViolations(document.body)).toEqual([]);
      });
    }
  }
});
