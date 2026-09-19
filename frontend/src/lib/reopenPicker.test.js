import { describe, expect, it } from "vitest";
import { canContinue, initDraft, openDialogs, reduce, restoreDraft, serializeDraft } from "./draftOrder";
import { changedFromInitial, reopenedActions, toBackPayload, toFrontPayload } from "./reopenPicker";

const art = (id, page, code = "a5", extra = {}) => ({
  id,
  matched_size_code: code,
  trim_width_mm: code === "a4" ? 210 : 148,
  trim_height_mm: code === "a4" ? 297 : 210,
  bleed_mm: 3,
  page_image: `/img/${id}.png`,
  is_valid: true,
  source_id: 7,
  page_index: page,
  ...extra,
});

const DEFAULTS = { size: "a5", sides: "double" };
const apply = (state, actions) => actions.reduce((s, a) => reduce(s, a), state);
const withTwoPageFile = () => apply(initDraft(DEFAULTS), [
  { type: "UPLOAD_FRONT", artwork: toFrontPayload(art(1, 1), art(2, 2)) },
]);

describe("reopened picker → draft actions", () => {
  it("swapping Front and Back replaces both Artwork and remembers their pages", () => {
    const s = apply(withTwoPageFile(), reopenedActions({ mode: "both", front: art(3, 2), back: art(4, 1), same: false }, withTwoPageFile().slots));
    expect(s.slots.front).toMatchObject({ id: 3, sourceId: 7, page: 2 });
    expect(s.slots.back).toMatchObject({ id: 4, sourceId: 7, page: 1 });
    expect(s.slots.frontFilledBoth).toBe(true);
  });

  it("choosing no Back removes the Back that was there", () => {
    const before = withTwoPageFile();
    const s = apply(before, reopenedActions({ mode: "both", front: art(3, 2), back: null, same: false }, before.slots));
    expect(s.slots.front.id).toBe(3);
    expect(s.slots.back).toBeNull();
  });

  it("choosing no Back when there was none changes nothing else", () => {
    const before = apply(initDraft(DEFAULTS), [{ type: "UPLOAD_FRONT", artwork: toFrontPayload(art(1, 3), null) }]);
    expect(reopenedActions({ mode: "both", front: art(3, 4), back: null, same: false }, before.slots).map((a) => a.type)).toEqual(["UPLOAD_FRONT"]);
  });

  it("'same artwork for the back' keeps Front's page on both sides", () => {
    const before = withTwoPageFile();
    const s = apply(before, reopenedActions({ mode: "both", front: art(3, 2), back: art(4, 2), same: true }, before.slots));
    expect(s.slots.front).toMatchObject({ id: 3, page: 2 });
    expect(s.slots.back).toMatchObject({ id: 4, page: 2 });
  });

  it("choosing one side leaves the other alone", () => {
    const before = withTwoPageFile();
    const front = apply(before, reopenedActions({ mode: "front", front: art(3, 2), back: null, same: false }, before.slots));
    expect(front.slots.front.id).toBe(3);
    expect(front.slots.back.id).toBe(2);
    const back = apply(before, reopenedActions({ mode: "back", front: null, back: art(5, 1), same: false }, before.slots));
    expect(back.slots.front.id).toBe(1);
    expect(back.slots.back.id).toBe(5);
  });

  it("a page whose Size differs from the ordered Size opens the usual size-mismatch dialog", () => {
    let s = initDraft({ size: "a5", sides: "single" });
    s = reduce(s, { type: "PICK", option: "size", value: "a5" }); // the customer has chosen: the file no longer leads
    s = apply(s, [{ type: "UPLOAD_FRONT", artwork: toFrontPayload(art(1, 3), null) }]);
    expect(openDialogs(s)).toEqual([]);
    const after = apply(s, reopenedActions({ mode: "both", front: art(2, 1, "a4"), back: null, same: false }, s.slots));
    expect(openDialogs(after).map((d) => d.kind)).toEqual(["size-mismatch"]);
    expect(canContinue(after)).toBe(false);
  });

  it("re-choosing pages clears an earlier resize choice and the approval ticks", () => {
    let s = apply(initDraft(DEFAULTS), [{ type: "UPLOAD_FRONT", artwork: toFrontPayload(art(1, 3), art(2, 4)) }, { type: "SET_TICK", name: "approval", value: true }]);
    s = { ...s, sizeChoice: { choice: "keep_size_scale", mode: "fit" } };
    const after = apply(s, reopenedActions({ mode: "both", front: art(3, 4), back: art(4, 3), same: false }, s.slots));
    expect(after.sizeChoice).toBeNull();
    expect(after.ticks).toEqual({ approval: false, warnings: false });
  });
});

describe("choices survive a refresh or a language switch", () => {
  it("the chosen pages and their source come back from the persisted draft with nothing re-uploaded", () => {
    const s = apply(initDraft(DEFAULTS), reopenedActions({ mode: "both", front: art(3, 3), back: art(4, 4), same: false }, initDraft(DEFAULTS).slots));
    const restored = restoreDraft(JSON.parse(JSON.stringify(serializeDraft(s))), DEFAULTS);
    expect(restored.slots.front).toMatchObject({ id: 3, sourceId: 7, page: 3 });
    expect(restored.slots.back).toMatchObject({ id: 4, sourceId: 7, page: 4 });
  });

  it("'same artwork for the back' is remembered by Back being Front's page", async () => {
    const { pickerTargetFor } = await import("./pagePicker");
    const s = apply(initDraft(DEFAULTS), reopenedActions({ mode: "both", front: art(3, 3), back: art(4, 3), same: true }, initDraft(DEFAULTS).slots));
    const restored = restoreDraft(JSON.parse(JSON.stringify(serializeDraft(s))), DEFAULTS);
    expect(pickerTargetFor("front", restored.slots).initial).toEqual({ front: 3, back: null, same: true });
  });
});

describe("changedFromInitial", () => {
  it("is false when the customer confirms the pages they already had", () => {
    expect(changedFromInitial({ front: 3, back: 4, same: false }, { front: 3, back: 4, same: false }, "both")).toBe(false);
    expect(changedFromInitial({ front: 3, back: null, same: true }, { front: 3, back: null, same: true }, "both")).toBe(false);
  });

  it("is true for any different page, side or 'same' setting", () => {
    expect(changedFromInitial({ front: 4, back: 3, same: false }, { front: 3, back: 4, same: false }, "both")).toBe(true);
    expect(changedFromInitial({ front: 3, back: null, same: true }, { front: 3, back: null, same: false }, "both")).toBe(true);
    expect(changedFromInitial({ front: null, back: 2, same: false }, { back: 3 }, "back")).toBe(true);
  });
});
