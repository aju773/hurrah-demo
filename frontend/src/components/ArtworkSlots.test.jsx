import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ArtworkSlots from "./ArtworkSlots";

// The help drawer pulls in Next navigation, which has nothing to do with uploads.
vi.mock("./DesignHelpDrawer", () => ({ default: () => null }));

class FakeXhr {
  static instances = [];
  constructor() {
    this.upload = {};
    FakeXhr.instances.push(this);
  }
  open() {}
  send(body) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  sendBytes(loaded, total) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  finishSending() {
    this.upload.onload?.();
  }
  respond(status, json) {
    this.status = status;
    this.responseText = JSON.stringify(json);
    this.onload?.();
  }
  dropConnection() {
    this.onerror?.();
  }
}

const ARTWORK = { id: 11, is_valid: true, matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210, orientation: "portrait", bleed_mm: 3, trim_source: "trimbox", preflight_report: { headline_severity: "ok", findings: [] } };
const FILE = new File(["%PDF-1.4"], "flyer.pdf", { type: "application/pdf" });

function renderSlots(props = {}) {
  const handlers = { onFrontResult: vi.fn(), onBackResult: vi.fn(), onFrontRemoved: vi.fn(), onBackRemoved: vi.fn(), onSameAsBackChange: vi.fn() };
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ArtworkSlots productId={1} sameAsBack={false} {...handlers} {...props} />
    </NextIntlClientProvider>
  );
  return { ...view, ...handlers };
}

function pickFront(container) {
  const input = container.querySelectorAll('input[type="file"]')[0];
  fireEvent.change(input, { target: { files: [FILE] } });
}

const xhr = (i = 0) => FakeXhr.instances[i];

beforeEach(() => {
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArtworkSlots upload flow", () => {
  it("goes from a progress bar to Checking to the detected card", async () => {
    const { container, onFrontResult } = renderSlots();
    pickFront(container);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    act(() => xhr().sendBytes(50, 100));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    act(() => xhr().finishSending());
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Checking your file…", { selector: "p:not(.sr-only)" })).toBeInTheDocument();
    await act(async () => xhr().respond(201, { front: ARTWORK, back: null, errors: [] }));
    expect(screen.getByText("Detected")).toBeInTheDocument();
    expect(onFrontResult).toHaveBeenCalledWith(ARTWORK, null);
  });

  it("cancel returns the slot to ready-for-another-file and reports nothing to the draft", async () => {
    const { container, onFrontResult } = renderSlots();
    pickFront(container);
    act(() => xhr().sendBytes(10, 100));
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]));
    expect(screen.getAllByText("Drag & drop a PDF here")).toHaveLength(2);
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Upload cancelled");
    expect(onFrontResult).not.toHaveBeenCalled();
    // A second file can be chosen straight away.
    pickFront(container);
    expect(FakeXhr.instances).toHaveLength(2);
  });

  it("Retry after a dropped connection re-sends the same file with the same upload key", async () => {
    const { container, onFrontResult } = renderSlots();
    pickFront(container);
    await act(async () => xhr(0).dropConnection());
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't reach the server");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    expect(FakeXhr.instances).toHaveLength(2);
    expect(xhr(1).body.get("file")).toBe(FILE);
    expect(xhr(1).body.get("upload_key")).toBe(xhr(0).body.get("upload_key"));
    await act(async () => xhr(1).respond(201, { front: ARTWORK, back: null, errors: [] }));
    expect(screen.getByText("Detected")).toBeInTheDocument();
    expect(onFrontResult).toHaveBeenCalledTimes(1);
  });

  it("offers Retry after server_busy but not after a rejected file", async () => {
    const { container } = renderSlots();
    pickFront(container);
    await act(async () => xhr(0).respond(429, { errors: [{ code: "server_busy", message: "Busy" }] }));
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Upload another file" }));
    pickFront(container);
    await act(async () => xhr(1).respond(400, { errors: [{ code: "not_a_pdf", message: "Nope" }] }));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("a new file after Upload another gets its own upload key", async () => {
    const { container } = renderSlots();
    pickFront(container);
    await act(async () => xhr(0).dropConnection());
    fireEvent.click(screen.getByRole("button", { name: "Upload another file" }));
    pickFront(container);
    expect(xhr(1).body.get("upload_key")).not.toBe(xhr(0).body.get("upload_key"));
  });
});
