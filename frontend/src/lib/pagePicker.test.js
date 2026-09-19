import { describe, expect, it } from "vitest";
import { chooseBack, chooseFront, evaluateChoice, initialChoiceFor, pageSizeLabel, pickerTargetFor, slotAsPage } from "./pagePicker";

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

describe("the same artwork for the back", () => {
  it("allows one page as both Front and Back when 'same' is on, and needs only a Front", () => {
    const result = evaluateChoice({ pages: PAGES, front: 3, back: null, same: true, orderedSize: "a5" });
    expect(result).toMatchObject({ canConfirm: true, samePage: false, backSizeDiffers: false });
    expect(result.backPage).toBe(result.frontPage);
    expect(evaluateChoice({ pages: PAGES, front: null, back: null, same: true, orderedSize: "a5" }).canConfirm).toBe(false);
  });

  it("still refuses the same page twice when 'same' is off", () => {
    expect(evaluateChoice({ pages: PAGES, front: 3, back: 3, same: false, orderedSize: "a5" }).canConfirm).toBe(false);
  });
});

describe("choosing one side while the other stays", () => {
  const fixedA5 = { matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210 };

  it("Back alone: needs a Back page that is the Size of the Front it goes with", () => {
    expect(evaluateChoice({ pages: PAGES, mode: "back", fixed: fixedA5, front: null, back: null, orderedSize: "a5" }).canConfirm).toBe(false);
    expect(evaluateChoice({ pages: PAGES, mode: "back", fixed: fixedA5, back: 4, orderedSize: "a5" }).canConfirm).toBe(true);
    const clash = evaluateChoice({ pages: PAGES, mode: "back", fixed: fixedA5, back: 1, orderedSize: "a5" });
    expect(clash).toMatchObject({ canConfirm: false, backSizeDiffers: true });
    expect(clash.frontPage).toBe(fixedA5);
  });

  it("Back alone with no Front yet has nothing to clash with", () => {
    expect(evaluateChoice({ pages: PAGES, mode: "back", fixed: null, back: 1, orderedSize: "a5" }).canConfirm).toBe(true);
  });

  it("Front alone: checked against the Back that stays, and only the chosen side is warned about", () => {
    expect(evaluateChoice({ pages: PAGES, mode: "front", fixed: fixedA5, front: 4, orderedSize: "a6" })).toMatchObject({ canConfirm: true, frontDiffersFromOrder: true, backDiffersFromOrder: false });
    expect(evaluateChoice({ pages: PAGES, mode: "front", fixed: fixedA5, front: 2, orderedSize: "a5" }).backSizeDiffers).toBe(true);
  });
});

describe("what a slot can reopen", () => {
  const slot = (sourceId, page, extra = {}) => ({ id: page * 10, sourceId, page, matchedSizeCode: "a5", mm: { width: 148, height: 210 }, ...extra });

  it("a file with no stored source has nothing to choose from", () => {
    expect(pickerTargetFor("front", { front: slot(null, 1), back: null })).toBeNull();
    expect(pickerTargetFor("front", { front: null, back: null })).toBeNull();
  });

  it("Front and Back from one source reopen together, from either card, keeping their pages", () => {
    const slots = { front: slot(7, 1), back: slot(7, 2) };
    for (const which of ["front", "back"]) {
      expect(pickerTargetFor(which, slots)).toEqual({ sourceId: 7, mode: "both", initial: { front: 1, back: 2, same: false }, fixed: null });
    }
  });

  it("a Back that is Front's own page shows as 'same artwork for the back'", () => {
    expect(pickerTargetFor("front", { front: slot(7, 3), back: slot(7, 3) }).initial).toEqual({ front: 3, back: null, same: true });
  });

  it("a Front alone reopens with no Back chosen", () => {
    expect(pickerTargetFor("front", { front: slot(7, 3), back: null })).toMatchObject({ mode: "both", initial: { front: 3, back: null, same: false } });
  });

  it("a Back from a different file reopens on its own, against the Front, and Front reopens on its own", () => {
    const slots = { front: slot(7, 3), back: slot(9, 2) };
    expect(pickerTargetFor("back", slots)).toMatchObject({ sourceId: 9, mode: "back", initial: { back: 2 }, fixed: slotAsPage(slots.front) });
    expect(pickerTargetFor("front", slots)).toMatchObject({ sourceId: 7, mode: "front", initial: { front: 3 }, fixed: slotAsPage(slots.back) });
  });

  it("a Back picked from a file while Front is a plain upload reopens as Back only", () => {
    const slots = { front: slot(null, 1), back: slot(9, 2) };
    expect(pickerTargetFor("back", slots)).toMatchObject({ sourceId: 9, mode: "back" });
    expect(pickerTargetFor("front", slots)).toBeNull();
  });

  it("initialChoiceFor is the choice a plain both-sides pick starts from", () => {
    expect(initialChoiceFor(slot(7, 3), slot(7, 4))).toEqual({ front: 3, back: 4, same: false });
  });

  it("slotAsPage reads a draft slot as a picker page", () => {
    expect(slotAsPage(slot(7, 1))).toEqual({ matched_size_code: "a5", trim_width_mm: 148, trim_height_mm: 210 });
    expect(slotAsPage(null)).toBeNull();
  });
});
