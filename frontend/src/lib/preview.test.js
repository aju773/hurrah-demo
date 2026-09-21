import { describe, expect, it, vi } from "vitest";
import { fetchPreview } from "@/lib/preview";

describe("fetchPreview", () => {
  it("asks for the rotated sides", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) });
    await fetchPreview({ frontId: 1, backId: 2, sizeCode: "a5", rotate: { front: true, back: false } });
    expect(new URL(fetchSpy.mock.calls[0][0]).searchParams.get("rotate")).toBe("front");
    await fetchPreview({ frontId: 1, backId: 2, sizeCode: "a5", rotate: { front: true, back: true } });
    expect(new URL(fetchSpy.mock.calls[1][0]).searchParams.get("rotate")).toBe("front,back");
    fetchSpy.mockRestore();
  });

  it("sends no rotate when nothing is rotated", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({}) });
    await fetchPreview({ frontId: 1, sizeCode: "a5" });
    await fetchPreview({ frontId: 1, sizeCode: "a5", rotate: { front: false, back: false } });
    for (const [url] of fetchSpy.mock.calls) expect(new URL(url).searchParams.has("rotate")).toBe(false);
    fetchSpy.mockRestore();
  });

  it("resolves null without a request when there is no Front id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await fetchPreview({ frontId: undefined, sizeCode: "a5" })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
