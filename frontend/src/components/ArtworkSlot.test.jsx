import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import ArtworkSlot from "./ArtworkSlot";

afterEach(cleanup);

function renderSlot(props = {}, locale = "en") {
  const handlers = { onFile: vi.fn(), onRemove: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn() };
  const view = render(
    <NextIntlClientProvider locale={locale} messages={locale === "ar" ? ar : en}>
      <ArtworkSlot id="s" label="Front" status="empty" fileName="" artwork={null} error={null} {...handlers} {...props} />
    </NextIntlClientProvider>
  );
  return { ...view, ...handlers };
}

const liveText = (container) => container.querySelector('[role="status"]').textContent;

describe("ArtworkSlot upload feedback", () => {
  it("shows a progress bar with the bytes-sent percentage while uploading", () => {
    const { container } = renderSlot({ status: "uploading", fileName: "a.pdf", progress: 0.42 });
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(container.textContent).toContain("Uploading a.pdf");
    expect(container.textContent).toContain("42%");
    expect(container.textContent).not.toContain("Checking your file");
  });

  it("shows a separate Checking stage, with no progress bar, once the file is sent", () => {
    const { container } = renderSlot({ status: "checking", fileName: "a.pdf" });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.textContent).toContain("Checking your file…");
  });

  it("offers Cancel in both stages", () => {
    for (const status of ["uploading", "checking"]) {
      const { onCancel } = renderSlot({ status, fileName: "a.pdf", progress: 0.1 });
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("offers Retry after network_failed and server_busy, and not after a bad file", () => {
    for (const code of ["network_failed", "server_busy"]) {
      const { onRetry } = renderSlot({ status: "error", fileName: "a.pdf", error: { code, message: null }, canRetry: true });
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(onRetry).toHaveBeenCalledTimes(1);
      cleanup();
    }
    renderSlot({ status: "error", fileName: "a.pdf", error: { code: "not_a_pdf", message: "x" }, canRetry: false });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.getByRole("button", { name: "Upload another file" })).toBeInTheDocument();
  });

  it("announces the error through an alert", () => {
    renderSlot({ status: "error", fileName: "a.pdf", error: { code: "network_failed", message: null }, canRetry: true });
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't reach the server");
  });

  it("announces upload, checking, cancelled and result states through the status region", () => {
    const { container, rerender } = renderSlot({ status: "uploading", fileName: "a.pdf", progress: 0.6 });
    expect(liveText(container)).toBe("Uploading a.pdf, 50%.");
    const again = (props) =>
      rerender(
        <NextIntlClientProvider locale="en" messages={en}>
          <ArtworkSlot id="s" label="Front" status="empty" fileName="" artwork={null} error={null} onFile={vi.fn()} onRemove={vi.fn()} {...props} />
        </NextIntlClientProvider>
      );
    again({ status: "checking", fileName: "a.pdf" });
    expect(liveText(container)).toBe("Checking your file…");
    again({ status: "empty", cancelled: true });
    expect(liveText(container)).toBe("Upload cancelled. Choose another file.");
    again({ status: "ok", fileName: "a.pdf", artwork: { is_valid: true, preflight_report: { headline_severity: "ok", findings: [] } } });
    expect(liveText(container)).not.toBe("");
  });

  it("keeps browse and drag-and-drop on an empty slot", () => {
    const { container, onFile } = renderSlot();
    const input = container.querySelector('input[type="file"]');
    const file = new File(["x"], "a.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
    const zone = screen.getByText("Drag & drop a PDF here").parentElement;
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledTimes(2);
  });

  it("has Arabic text for every new state", () => {
    const { container } = renderSlot({ status: "uploading", fileName: "a.pdf", progress: 0.3 }, "ar");
    expect(container.textContent).toContain("جارٍ رفع");
    expect(screen.getByRole("button", { name: "إلغاء" })).toBeInTheDocument();
  });
});
