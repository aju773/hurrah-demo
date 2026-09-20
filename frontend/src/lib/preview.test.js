import { describe, expect, it, vi } from "vitest";
import { fetchPreview } from "@/lib/preview";

describe("fetchPreview", () => {
  it("resolves null without a request when there is no Front id", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await fetchPreview({ frontId: undefined, sizeCode: "a5" })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
