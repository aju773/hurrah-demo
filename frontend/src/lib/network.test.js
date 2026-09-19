import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./network";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("returns the response when the server answers in time", async () => {
    const response = { ok: true };
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(response)));
    await expect(fetchWithTimeout("/x", {}, 1000)).resolves.toBe(response);
  });

  it("rejects when the server is slower than the timeout, and aborts the request", async () => {
    let signal;
    vi.stubGlobal(
      "fetch",
      vi.fn((url, options) => {
        signal = options.signal;
        return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      })
    );
    const pending = fetchWithTimeout("/x", {}, 1000);
    const caught = pending.catch((e) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await caught).toBeInstanceOf(Error);
    expect(signal.aborted).toBe(true);
  });

  it("passes the request options through", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithTimeout("/x", { method: "POST", body: "b" }, 1000);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST", body: "b" });
  });
});
