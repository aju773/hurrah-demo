import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ReopenPagePicker from "./ReopenPagePicker";

const page = (number, code, w = 148, h = 210) => ({ number, matched_size_code: code, trim_width_mm: w, trim_height_mm: h, orientation: "portrait", thumbnail_url: `http://x/${number}.png` });
const SOURCE = { id: 7, page_count: 4, original_filename: "menu.pdf", pages: [page(1, "a4", 210, 297), page(2, "a5"), page(3, "a5"), page(4, "a5")] };
const art = (id, pageIndex, slot) => ({ id, slot, page_index: pageIndex, source_id: 7, matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210, is_valid: true });
const SLOTS = { front: { id: 1, sourceId: 7, page: 2 }, back: { id: 2, sourceId: 7, page: 3 } };
const BOTH = { sourceId: 7, mode: "both", initial: { front: 2, back: 3, same: false }, fixed: null };

function routes(assign = []) {
  const queue = [...assign];
  const fetchMock = vi.fn((url) => {
    if (String(url).includes("/assign/")) {
      const answer = queue.shift() ?? {};
      return Promise.resolve({ ok: answer.ok ?? true, status: answer.status ?? 201, json: () => Promise.resolve(answer.body ?? {}) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SOURCE) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const assignBodies = (fetchMock) => fetchMock.mock.calls.filter(([u]) => String(u).includes("/assign/")).map(([, init]) => JSON.parse(init.body));

async function open(props = {}) {
  const handlers = { onAssigned: vi.fn(), onCancel: vi.fn() };
  await act(async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ReopenPagePicker target={BOTH} slots={SLOTS} orderedSize="a5" {...handlers} {...props} />
      </NextIntlClientProvider>
    );
  });
  return handlers;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReopenPagePicker", () => {
  it("reads the stored source again (no upload) and opens on the pages in use", async () => {
    const fetchMock = routes();
    await open();
    expect(fetchMock.mock.calls[0][0]).toContain("/api/sources/7/");
    expect(screen.getByRole("dialog", { name: "Choose your flyer pages" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use page 2 as Front" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Use page 3 as Back" })).toHaveAttribute("aria-pressed", "true");
  });

  it("swaps Front and Back in one assignment and hands back the new Artwork", async () => {
    const fetchMock = routes([{ body: { front: art(11, 3, "front"), back: art(12, 2, "back"), errors: [] } }]);
    const { onAssigned } = await open();
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    fireEvent.click(screen.getByRole("button", { name: "Use page 2 as Back" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    expect(assignBodies(fetchMock)).toEqual([expect.objectContaining({ front: 3, back: 2 })]);
    expect(onAssigned).toHaveBeenCalledWith({ mode: "both", front: art(11, 3, "front"), back: art(12, 2, "back"), same: false });
  });

  it("confirming the pages already in use changes nothing and makes no Artwork", async () => {
    const fetchMock = routes();
    const { onAssigned, onCancel } = await open();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    expect(assignBodies(fetchMock)).toEqual([]);
    expect(onAssigned).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it("'same artwork for the back' is two assignments: Front, then Back copied from it", async () => {
    const fetchMock = routes([{ body: { front: art(11, 3, "front"), back: null, errors: [] } }, { body: { front: null, back: art(12, 3, "back"), errors: [] } }]);
    const { onAssigned } = await open();
    fireEvent.click(screen.getByRole("button", { name: "Use page 3 as Front" }));
    fireEvent.click(screen.getByLabelText("Use the same artwork for the back"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    const [first, second] = assignBodies(fetchMock);
    expect(first).toMatchObject({ front: 3 });
    expect(first.back).toBeUndefined();
    expect(second).toMatchObject({ back: 3, front_id: 11 });
    expect(onAssigned).toHaveBeenCalledWith({ mode: "both", front: art(11, 3, "front"), back: art(12, 3, "back"), same: true });
  });

  it("Back on its own is checked against the Front that stays", async () => {
    const fetchMock = routes([{ body: { front: null, back: art(12, 4, "back"), errors: [] } }]);
    const target = { sourceId: 7, mode: "back", initial: { back: 3 }, fixed: { matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210 } };
    const { onAssigned } = await open({ target });
    fireEvent.click(screen.getByRole("button", { name: "Use page 4 as Back" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    expect(assignBodies(fetchMock)[0]).toMatchObject({ back: 4, front_id: 1 });
    expect(onAssigned).toHaveBeenCalledWith(expect.objectContaining({ mode: "back", back: art(12, 4, "back") }));
  });

  it("Front on its own is checked against the Back that stays", async () => {
    const fetchMock = routes([{ body: { front: art(11, 4, "front"), back: null, errors: [] } }]);
    const target = { sourceId: 7, mode: "front", initial: { front: 2 }, fixed: { matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210 } };
    await open({ target });
    fireEvent.click(screen.getByRole("button", { name: "Use page 4 as Front" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    expect(assignBodies(fetchMock)[0]).toMatchObject({ front: 4, back_id: 2 });
  });

  it("keeps the picker open with the server's reason when a choice is refused", async () => {
    routes([{ ok: false, status: 400, body: { errors: [{ code: "back_size_differs", message: "x" }] } }]);
    const { onAssigned } = await open();
    fireEvent.click(screen.getByRole("button", { name: "Use page 4 as Front" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Use these pages" })));
    expect(screen.getByRole("dialog", { name: "Choose your flyer pages" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Back must be the same size as front");
    expect(onAssigned).not.toHaveBeenCalled();
  });

  it("says so when the stored file is gone, and closes", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 410, json: () => Promise.resolve({}) })));
    const { onCancel } = await open();
    expect(screen.getByRole("alert")).toHaveTextContent("no longer stored");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
