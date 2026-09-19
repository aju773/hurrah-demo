import { describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import SyncDialog from "./SyncDialog";

afterEach(cleanup);

const FALLBACK_NOTICE = { option: "turnaround", from: "same-day", to: "express", reason: "Same-day is not available for A4." };
const READY_PREVIEW = { status: "ready", quote: { total_aed: "123.45" }, notices: [FALLBACK_NOTICE], resolvedSelection: {} };
const MONEY = /AED|درهم|\btotal\b|الإجمالي|\d+\.\d{2}/i;

const DIALOGS = {
  "size-mismatch": { key: "size:a4", kind: "size-mismatch", field: "size", file: "a4", ordered: "a5" },
  "front-only": { key: "sides:double", kind: "front-only", field: "sides", file: "single", ordered: "double" },
  "back-on-single": { key: "sides:single", kind: "back-on-single", field: "sides", file: "double", ordered: "single" },
};

function renderDialog(kind, { commerceEnabled = false, preview = READY_PREVIEW, locale = "en", extra = {} } = {}) {
  const messages = locale === "ar" ? ar : en;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SyncDialog
        dialog={DIALOGS[kind]}
        preview={preview}
        onPreviewSwitch={vi.fn()}
        onResolve={vi.fn()}
        sizeValues={[{ code: "a5", width_mm: 148, height_mm: 210 }]}
        productBleedMm={3}
        productSafeMm={5}
        fileTrimMm={[210, 297]}
        fileBleedMm={3}
        fileImageUrl={null}
        commerceEnabled={commerceEnabled}
        {...extra}
      />
    </NextIntlClientProvider>
  );
}

describe("SyncDialog with the Commerce switch off (ticket 03)", () => {
  for (const kind of Object.keys(DIALOGS)) {
    for (const locale of ["en", "ar"]) {
      it(`${kind} (${locale}) shows no amount or cost line`, () => {
        const { container } = renderDialog(kind, { locale });
        expect(container.textContent).not.toMatch(MONEY);
      });
    }

    it(`${kind} shows the Turnaround fallback notice before the customer confirms`, () => {
      renderDialog(kind);
      expect(screen.getByText(FALLBACK_NOTICE.reason)).toBeTruthy();
    });

    it(`${kind} shows no notice block when nothing changes`, () => {
      renderDialog(kind, { preview: { ...READY_PREVIEW, notices: [] } });
      expect(screen.queryByText(FALLBACK_NOTICE.reason)).toBeNull();
    });
  }

  it("keeps the confirm-switch button disabled until the preview (with its notices) is ready", () => {
    renderDialog("front-only", { preview: { status: "pending" } });
    expect(screen.getByRole("button", { name: en.SyncDialog.switchToSingle }).disabled).toBe(true);
  });

  it("still offers Fit and Fill with scale % and mm notes after 'Keep and resize'", async () => {
    const { container } = renderDialog("size-mismatch");
    screen.getByRole("button", { name: /Keep A5 and resize/ }).click();
    expect(await screen.findByText(en.SyncDialog.fitInside)).toBeTruthy();
    expect(screen.getByText(en.SyncDialog.fillPage)).toBeTruthy();
    expect(container.textContent).toMatch(/%/);
    expect(container.textContent).not.toMatch(MONEY);
  });
});

describe("SyncDialog with the Commerce switch on", () => {
  it("size-mismatch still shows the new total", () => {
    const { container } = renderDialog("size-mismatch", { commerceEnabled: true });
    expect(container.textContent).toContain("AED 123.45");
  });

  it("front-only and back-on-single show the Turnaround notice", () => {
    for (const kind of ["front-only", "back-on-single"]) {
      const { unmount } = renderDialog(kind, { commerceEnabled: true });
      expect(screen.getByText(FALLBACK_NOTICE.reason)).toBeTruthy();
      unmount();
    }
  });
});
