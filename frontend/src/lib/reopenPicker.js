// Turning the Page picker's result into draft actions (no DOM, no fetch), so
// the draft reducer stays the one place that knows what a changed Artwork means:
// it clears the resize choice and approval ticks, and reopens the size-mismatch
// dialog for a page that isn't the ordered Size.

/** An Artwork as the API returns it → the draft's UPLOAD_FRONT payload. `back` is
 * the Back Artwork when the same upload made both (a 2-page file, or a picker
 * choice of two pages). */
export function toFrontPayload(front, back) {
  return {
    id: front.id,
    matchedSizeCode: front.matched_size_code ?? null,
    mm: { width: front.trim_width_mm, height: front.trim_height_mm },
    bleedMm: front.bleed_mm ?? null,
    imageUrl: front.page_image ?? null,
    pages: back ? 2 : 1,
    backId: back?.id,
    backImageUrl: back?.page_image ?? null,
    hasError: !front.is_valid,
    backHasError: back ? !back.is_valid : false,
    sourceId: front.source_id ?? null,
    page: front.page_index ?? null,
    backPage: back?.page_index ?? null,
  };
}

/** An Artwork as the API returns it → the draft's UPLOAD_BACK payload. */
export function toBackPayload(back) {
  return {
    id: back.id,
    matchedSizeCode: back.matched_size_code ?? null,
    mm: { width: back.trim_width_mm, height: back.trim_height_mm },
    bleedMm: back.bleed_mm ?? null,
    imageUrl: back.page_image ?? null,
    hasError: !back.is_valid,
    sourceId: back.source_id ?? null,
    page: back.page_index ?? null,
  };
}

/** The draft actions for a reopened picker's result: `front` / `back` are the new
 * Artwork (either may be null), `same` is "Use the same artwork for the back",
 * `slots` the draft's slots before. Choosing no Back drops the Back that was there. */
export function reopenedActions({ mode, front, back, same }, slots) {
  if (mode === "back") return [{ type: "UPLOAD_BACK", artwork: toBackPayload(back) }];
  if (mode === "front") return [{ type: "UPLOAD_FRONT", artwork: toFrontPayload(front, null) }];
  if (same && back) {
    return [
      { type: "UPLOAD_FRONT", artwork: toFrontPayload(front, null) },
      { type: "UPLOAD_BACK", artwork: toBackPayload(back) },
    ];
  }
  const actions = [{ type: "UPLOAD_FRONT", artwork: toFrontPayload(front, back) }];
  if (!back && slots?.back) actions.push({ type: "REMOVE_ARTWORK", slot: "back" });
  return actions;
}

/** True when a confirmed choice differs from what the picker opened with, so
 * confirming the pages already in use doesn't make duplicate Artwork. */
export function changedFromInitial(choice, initial, mode) {
  if (mode === "back") return choice.back !== (initial.back ?? null);
  if (mode === "front") return choice.front !== (initial.front ?? null);
  return choice.front !== (initial.front ?? null) || (choice.back ?? null) !== (initial.back ?? null) || Boolean(choice.same) !== Boolean(initial.same);
}
