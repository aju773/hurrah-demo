import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const PAGE = (number, code, w = 148, h = 210) => ({ number, matched_size_code: code, trim_width_mm: w, trim_height_mm: h, orientation: "portrait", thumbnail_url: `http://x/${number}.png` });
const SOURCE = { id: 7, page_count: 5, original_filename: "brochure.pdf", pages: [PAGE(1, "a4", 210, 297), PAGE(2, "a6", 105, 148), PAGE(3, "a5"), PAGE(4, "a5"), PAGE(5, "a4", 210, 297)] };
const PHASE_ONE = { page_count: 5, front: null, back: null, errors: [], source: SOURCE };
const FRONT_3 = { ...ARTWORK, id: 31, page_index: 3, source_id: 7 };
const BACK_4 = { ...ARTWORK, id: 32, slot: "back", page_index: 4, source_id: 7 };

function mockAssign(response) {
  const fetchMock = vi.fn((url, init) => {
    if (String(url).includes("/assign/")) return Promise.resolve({ ok: response.ok ?? true, status: response.status ?? 201, json: () => Promise.resolve(response.body) });
    return Promise.resolve({ ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const assignCalls = (fetchMock) => fetchMock.mock.calls.filter(([url]) => String(url).includes("/assign/"));

describe("ArtworkSlots page picker", () => {
  async function openPicker(props) {
    const view = renderSlots({ orderedSize: "a5", ...props });
    pickFront(view.container);
    await act(async () => xhr().respond(201, PHASE_ONE));
    return view;
  }

  it("opens a picker with every page instead of an error, and makes no Artwork yet", async () => {
    const { onFrontResult } = await openPicker();
    const dialog = screen.getByRole("dialog", { name: "Choose your flyer pages" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(5);
    expect(screen.getByText("Page 3")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onFrontResult).not.toHaveBeenCalled();
  });

  it("assigns pages 3 and 4 and fills Front and Back like a one-shot upload", async () => {
    const fetchMock = mockAssign({ body: { page_count: 5, front: FRONT_3, back: BACK_4, errors: [] } });
    const { onFrontResult } = await openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    fireEvent.click(screen.getByRole("button", { name: "Use page 4 as Back" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    const [[url, init]] = assignCalls(fetchMock);
    expect(url).toContain("/api/sources/7/assign/");
    expect(JSON.parse(init.body)).toMatchObject({ front: 3, back: 4 });
    expect(onFrontResult).toHaveBeenCalledWith(FRONT_3, BACK_4);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByText("Detected")).toHaveLength(2);
  });

  it("will not continue until Front is chosen, and explains a Back of another size", async () => {
    await openPicker();
    const confirm = screen.getByRole("button", { name: "Use these pages" });
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    expect(confirm).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Use page 1 as Back" }));
    expect(confirm).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Front is A5 but Back is A4. Front and Back must be the same size");
    fireEvent.click(screen.getByRole("button", { name: "Use page 4 as Back" }));
    expect(confirm).toBeEnabled();
  });

  it("warns, without blocking, about a page that is not the ordered Size", async () => {
    await openPicker({ orderedSize: "a4" });
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    expect(screen.getByText(/Front page 3 is A5, but your order is A4/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use these pages" })).toBeEnabled();
  });

  it("keeps the picker open with the server's reason when a choice is refused", async () => {
    mockAssign({ ok: false, status: 400, body: { errors: [{ code: "back_size_differs", slot: "back", message: "x" }] } });
    const { onFrontResult } = await openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Back must be the same size as front");
    expect(onFrontResult).not.toHaveBeenCalled();
  });

  it("a resent choice reuses its key so the server makes the Artwork once", async () => {
    const fetchMock = mockAssign({ ok: false, status: 429, body: { errors: [{ code: "server_busy", message: "x" }] } });
    await openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    // After a busy or dropped answer the button says Retry; it sends the same choice again.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    const [first, second] = assignCalls(fetchMock).map(([, init]) => JSON.parse(init.body).upload_key);
    expect(first).toBeTruthy();
    expect(second).toBe(first);
  });

  it("Cancel and Escape both abandon the picker: no Artwork, source dropped", async () => {
    const fetchMock = mockAssign({ body: {} });
    const { onFrontResult } = await openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Cancel", hidden: false }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onFrontResult).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url, init]) => init?.method === "DELETE" && String(url).includes("upload_key="))).toBe(true);
    expect(screen.getAllByText("Drag & drop a PDF here")).toHaveLength(2);
  });

  it("Escape closes the picker", async () => {
    mockAssign({ body: {} });
    await openPicker();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("copies a picker Front's page into Back for 'Use the same artwork', not the multi-page file", async () => {
    const answers = [
      { page_count: 5, front: FRONT_3, back: null, errors: [] },
      { page_count: 5, front: null, back: { ...BACK_4, id: 40, page_index: 3 }, errors: [] },
    ];
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(answers.shift()) }));
    vi.stubGlobal("fetch", fetchMock);
    const { onBackResult } = await openPicker({ sameAsBack: true });
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
    expect(bodies[1]).toMatchObject({ back: 3, front_id: 31 });
    expect(FakeXhr.instances).toHaveLength(1); // the multi-page file was never re-sent
    expect(onBackResult).toHaveBeenCalled();
  });
});

describe("ArtworkSlots picker: same artwork for the back", () => {
  it("sends only Front and turns 'same as back' on, so Back is copied from the source", async () => {
    const fetchMock = mockAssign({ body: { page_count: 5, front: FRONT_3, back: null, errors: [] } });
    const view = renderSlots({ orderedSize: "a5" });
    pickFront(view.container);
    await act(async () => xhr().respond(201, PHASE_ONE));
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Use the same artwork for the back"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    const body = JSON.parse(assignCalls(fetchMock)[0][1].body);
    expect(body).toMatchObject({ front: 3 });
    expect(body.back).toBeUndefined();
    expect(view.onSameAsBackChange).toHaveBeenCalledWith(true);
  });
});

describe("ArtworkSlots page picker in the Back slot", () => {
  async function dropMultiPageIntoBack(props) {
    const view = renderSlots({ orderedSize: "a5", ...props });
    pickFront(view.container);
    await act(async () => xhr(0).respond(201, { page_count: 1, front: ARTWORK, back: null, errors: [] }));
    fireEvent.change(view.container.querySelector('input[type="file"]'), { target: { files: [FILE] } }); // Front is filled, so Back's is the only one left
    await act(async () => xhr(1).respond(201, PHASE_ONE));
    return view;
  }

  it("opens the picker for one page instead of a dead end", async () => {
    const { onBackResult } = await dropMultiPageIntoBack();
    expect(screen.getByRole("dialog", { name: "Choose your flyer pages" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /as Front/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /as Back/ })).toHaveLength(5);
    expect(onBackResult).not.toHaveBeenCalled();
  });

  it("assigns just the Back page, against the Front already there", async () => {
    const fetchMock = mockAssign({ body: { page_count: 5, front: null, back: BACK_4, errors: [] } });
    const { onBackResult, onFrontResult } = await dropMultiPageIntoBack();
    fireEvent.click(screen.getByRole("button", { name: "Use page 4 as Back" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    const [[url, init]] = assignCalls(fetchMock);
    expect(url).toContain("/api/sources/7/assign/");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ back: 4, front_id: ARTWORK.id });
    expect(body.front).toBeUndefined();
    expect(onBackResult).toHaveBeenCalledWith(BACK_4);
    expect(onFrontResult).toHaveBeenCalledTimes(1); // only the earlier Front upload
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByText("Detected")).toHaveLength(2);
  });

  it("will not take a Back page of another Size than the Front, and says why", async () => {
    await dropMultiPageIntoBack();
    fireEvent.click(screen.getByRole("button", { name: "Use page 1 as Back" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Front is A5 but Back is A4");
    expect(screen.getByRole("button", { name: "Use these pages" })).toBeDisabled();
  });
});

describe("ArtworkSlots Choose pages", () => {
  it("shows Choose pages on a file with a stored source, and asks the parent to reopen it", async () => {
    const onChoosePages = vi.fn();
    const view = renderSlots({ onChoosePages });
    pickFront(view.container);
    await act(async () => xhr().respond(201, { page_count: 2, front: { ...ARTWORK, source_id: 7, page_index: 1 }, back: { ...ARTWORK, id: 12, source_id: 7, page_index: 2 }, errors: [] }));
    const buttons = screen.getAllByRole("button", { name: "Choose pages" });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);
    expect(onChoosePages).toHaveBeenCalledWith("back");
  });

  it("shows nothing for a plain upload with no stored source", async () => {
    const view = renderSlots({ onChoosePages: vi.fn() });
    pickFront(view.container);
    await act(async () => xhr().respond(201, { page_count: 1, front: ARTWORK, back: null, errors: [] }));
    expect(screen.queryByRole("button", { name: "Choose pages" })).toBeNull();
  });
});

describe("ArtworkSlots reloading a draft's Artwork", () => {
  it("shows Retry on a card that couldn't be reloaded (not a blank slot) and fills it once it can", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ ...ARTWORK, original_filename: "flyer.pdf" }) });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      renderSlots({ initialFrontId: 11 });
    });
    expect(screen.getByText(en.ArtworkErrors.network_failed)).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    expect(screen.queryByText(en.ArtworkErrors.network_failed)).toBeNull();
    expect(screen.getByText("flyer.pdf")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
