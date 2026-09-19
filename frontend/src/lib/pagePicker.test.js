import { describe, expect, it } from "vitest";
import { chooseBack, chooseFront, evaluateChoice, pageSizeLabel } from "./pagePicker";

const page = (number, code, w = 148, h = 210) => ({
  number,
  matched_size_code: code,
  trim_width_mm: w,
  trim_height_mm: h,
  orientation: w > h ? "landscape" : "portrait",
});
const PAGES = [page(1, "a4", 210, 297), page(2, "a6", 105, 148), page(3, "a5"), page(4, "a5"), page(5, "a4", 210, 297)];

describe("evaluateChoice", () => {
  it("needs a Front before it can continue", () => {
    expect(evaluateChoice({ pages: PAGES, front: null, back: null, orderedSize: "a5" }).canConfirm).toBe(false);
  });

  it("accepts pages 3 and 4 of the same size for an A5 order with no warnings", () => {
    const result = evaluateChoice({ pages: PAGES, front: 3, back: 4, orderedSize: "a5" });
    expect(result).toMatchObject({ canConfirm: true, backSizeDiffers: false, frontDiffersFromOrder: false, backDiffersFromOrder: false });
  });

  it("accepts a Front on its own", () => {
    expect(evaluateChoice({ pages: PAGES, front: 3, back: null, orderedSize: "a5" }).canConfirm).toBe(true);
  });

  it("refuses a Back of another Size than the Front, and says which sizes", () => {
    const result = evaluateChoice({ pages: PAGES, front: 3, back: 1, orderedSize: "a5" });
    expect(result.canConfirm).toBe(false);
    expect(result.backSizeDiffers).toBe(true);
  });

  it("refuses the same page for Front and Back", () => {
    const result = evaluateChoice({ pages: PAGES, front: 3, back: 3, orderedSize: "a5" });
    expect(result.canConfirm).toBe(false);
    expect(result.samePage).toBe(true);
  });

  it("warns, without blocking, when a chosen page is not the ordered Size", () => {
    const result = evaluateChoice({ pages: PAGES, front: 1, back: 5, orderedSize: "a5" });
    expect(result.canConfirm).toBe(true);
    expect(result.frontDiffersFromOrder).toBe(true);
    expect(result.backDiffersFromOrder).toBe(true);
  });

  it("warns when a page matches no flyer Size at all", () => {
    const pages = [page(1, null, 100, 200)];
    expect(evaluateChoice({ pages, front: 1, back: null, orderedSize: "a5" }).frontDiffersFromOrder).toBe(true);
  });

  it("treats two unmatched pages as the same Size when they measure alike, either way round", () => {
    const pages = [page(1, null, 100, 200), page(2, null, 200.5, 100), page(3, null, 120, 200)];
    expect(evaluateChoice({ pages, front: 1, back: 2, orderedSize: "a5" }).backSizeDiffers).toBe(false);
    expect(evaluateChoice({ pages, front: 1, back: 3, orderedSize: "a5" }).backSizeDiffers).toBe(true);
  });

  it("never blames the ordered Size when there is none yet", () => {
    expect(evaluateChoice({ pages: PAGES, front: 1, back: null, orderedSize: null }).frontDiffersFromOrder).toBe(false);
  });
});

describe("choosing pages", () => {
  it("choosing a page for one side frees it from the other", () => {
    expect(chooseFront({ front: 3, back: 4 }, 4)).toEqual({ front: 4, back: null });
    expect(chooseBack({ front: 3, back: 4 }, 3)).toEqual({ front: null, back: 3 });
  });

  it("choosing the page a side already has clears that side (Back only: no back)", () => {
    expect(chooseBack({ front: 3, back: 4 }, 4)).toEqual({ front: 3, back: null });
    expect(chooseFront({ front: 3, back: 4 }, 3)).toEqual({ front: null, back: 4 });
  });
});

describe("pageSizeLabel", () => {
  it("names a matched Size in capitals", () => {
    expect(pageSizeLabel(page(3, "a5"))).toEqual({ code: "A5", mm: null });
  });

  it("gives the measured mm for a page that matches nothing", () => {
    expect(pageSizeLabel(page(1, null, 100, 200))).toEqual({ code: null, mm: { width: 100, height: 200 } });
  });
});
