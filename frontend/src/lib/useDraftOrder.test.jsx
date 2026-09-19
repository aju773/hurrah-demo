import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import useDraftOrder from "./useDraftOrder";
import { initDraft, serializeDraft } from "./draftOrder";

const DEFAULTS = { size: "a5", turnaround: "standard" };
const CONFIGURATION = {
  selection: DEFAULTS,
  notices: [],
  quote: null,
  blocked: {},
  price_grid: null,
  clock: { now: "n1", seconds_to_cutoff: 100, promised_date: "2026-09-22" },
  commerce_enabled: false,
  turnarounds: [],
  available: {},
};

function saveDraft(patch = {}) {
  const draft = { ...serializeDraft(initDraft(DEFAULTS)), idempotencyKey: "k", ...patch };
  window.sessionStorage.setItem("flyers-draft-order", JSON.stringify(draft));
}
const FRONT = { id: 5, matchedSizeCode: "a5", mm: { width: 148, height: 210 }, bleedMm: 3, imageUrl: null, hasError: false, sourceId: null, page: null };

const isConfiguration = (url) => String(url).includes("/configuration/");
const ok = (json) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(json) });

beforeEach(() => window.sessionStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("useDraftOrder when the network fails", () => {
  it("still finishes loading a saved draft when its Artwork can't be re-read, and keeps that Artwork", async () => {
    saveDraft({ slots: { front: FRONT, back: null, sameBack: false } });
    vi.stubGlobal("fetch", vi.fn((url) => (isConfiguration(url) ? ok(CONFIGURATION) : Promise.reject(new TypeError("Failed to fetch")))));
    const { result } = renderHook(() => useDraftOrder({ defaults: DEFAULTS, locale: "en", initialConfiguration: CONFIGURATION }));
    await waitFor(() => expect(result.current.rehydrating).toBe(false));
    expect(result.current.state.slots.front).toMatchObject({ id: 5, matchedSizeCode: "a5" });
  });

  it("drops a saved Artwork only when the server says it is gone", async () => {
    saveDraft({ slots: { front: FRONT, back: null, sameBack: false } });
    vi.stubGlobal("fetch", vi.fn((url) => (isConfiguration(url) ? ok(CONFIGURATION) : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }))));
    const { result } = renderHook(() => useDraftOrder({ defaults: DEFAULTS, locale: "en", initialConfiguration: CONFIGURATION }));
    await waitFor(() => expect(result.current.rehydrating).toBe(false));
    expect(result.current.state.slots.front).toBeNull();
  });

  it("reports a Configuration request that failed, keeps the customer's choice, and Retry asks again", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      let online = false;
      const fetchMock = vi.fn((url) => (online ? ok({ ...CONFIGURATION, selection: { ...DEFAULTS, size: "a4" } }) : Promise.reject(new TypeError("Failed to fetch"))));
      vi.stubGlobal("fetch", fetchMock);
      const { result } = renderHook(() => useDraftOrder({ defaults: DEFAULTS, locale: "en", initialConfiguration: CONFIGURATION }));
      await waitFor(() => expect(result.current.rehydrating).toBe(false));

      act(() => result.current.pick("size", "a4"));
      await waitFor(() => expect(result.current.syncFailed).toBe(true));
      expect(result.current.state.config.size).toBe("a4");

      online = true;
      const calls = fetchMock.mock.calls.length;
      act(() => result.current.retrySync());
      await waitFor(() => expect(result.current.syncFailed).toBe(false));
      expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
      await waitFor(() => expect(result.current.state.pendingRequote).toBeNull());
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
