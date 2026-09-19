// Pure rules for the Page picker (no DOM, no fetch). The server enforces the same
// rules when pages are assigned (orders/source_views.py); this module gives the
// picker the same answer immediately, with the reason.

// The Product's default Size tolerance. Only used to compare two pages that match
// no flyer Size; the server, which knows the Product's own value, has the last word.
const UNMATCHED_TOLERANCE_MM = 1.5;

function sameSize(a, b) {
  if (a.matched_size_code || b.matched_size_code) return a.matched_size_code === b.matched_size_code;
  const alike = (x, y) => Math.abs(x - y) <= UNMATCHED_TOLERANCE_MM;
  const straight = alike(a.trim_width_mm, b.trim_width_mm) && alike(a.trim_height_mm, b.trim_height_mm);
  const turned = alike(a.trim_width_mm, b.trim_height_mm) && alike(a.trim_height_mm, b.trim_width_mm);
  return straight || turned;
}

/** What the picker shows and allows for a choice of page numbers (1-based; null =
 * nothing chosen for that side). Differing from the ordered Size only warns: it
 * feeds the size-mismatch dialog after the pages are chosen.
 *
 * `mode` is "both" (choose Front and Back), or "front" / "back" (choose one side
 * while the other stays as `fixed`, a page-like {matched_size_code, trim_*_mm} or
 * null). `same` is "Use the same artwork for the back": Back is Front's page, the
 * only way one page may be on both sides. frontPage / backPage are the pages each
 * side would end up with, fixed side included. */
export function evaluateChoice({ pages, front, back, same = false, orderedSize, mode = "both", fixed = null }) {
  const byNumber = (n) => pages.find((p) => p.number === n) ?? null;
  const chosenFront = mode === "back" ? null : front == null ? null : byNumber(front);
  const chosenBack = mode === "front" || same ? null : back == null ? null : byNumber(back);
  const frontPage = mode === "back" ? fixed : chosenFront;
  const backPage = same ? chosenFront : mode === "front" ? fixed : chosenBack;
  const samePage = !same && mode === "both" && chosenFront != null && chosenBack != null && front === back;
  const backSizeDiffers = !same && !samePage && frontPage != null && backPage != null && !sameSize(frontPage, backPage);
  const differsFromOrder = (p) => Boolean(orderedSize) && p != null && p.matched_size_code !== orderedSize;
  const chosenOk = mode === "back" ? chosenBack != null : chosenFront != null;
  return {
    frontPage,
    backPage,
    samePage,
    backSizeDiffers,
    frontDiffersFromOrder: differsFromOrder(chosenFront),
    backDiffersFromOrder: differsFromOrder(same ? null : chosenBack),
    canConfirm: chosenOk && !samePage && !backSizeDiffers,
  };
}

/** Pick `number` for Front. A page can only be on one side, so it leaves the
 * other; picking Front's own page again clears Front. */
export function chooseFront({ front, back }, number) {
  return { front: front === number ? null : number, back: back === number ? null : back };
}

export function chooseBack({ front, back }, number) {
  return { front: front === number ? null : front, back: back === number ? null : number };
}

/** How to name a page's Size: the matched Size's code, or its measured mm. */
export function pageSizeLabel(page) {
  if (page.matched_size_code) return { code: page.matched_size_code.toUpperCase(), mm: null };
  return { code: null, mm: { width: page.trim_width_mm, height: page.trim_height_mm } };
}

/** A draft slot ({matchedSizeCode, mm}) read as a picker page, to compare Sizes with. */
export function slotAsPage(slot) {
  if (!slot) return null;
  return { matched_size_code: slot.matchedSizeCode ?? null, trim_width_mm: slot.mm?.width ?? null, trim_height_mm: slot.mm?.height ?? null };
}

/** Where a both-sides picker starts from, given the draft's Front and Back slots
 * (both from one source): their pages, or "same artwork" when Back is Front's page. */
export function initialChoiceFor(front, back) {
  const same = Boolean(back) && back.page === front.page;
  return { front: front.page, back: back && !same ? back.page : null, same };
}

/** What "Choose pages" on a slot reopens, or null when that slot's file has no
 * stored source (a plain upload). Front and Back from one source are chosen
 * together; a side that came from a different file is chosen on its own, against
 * the side that stays ({sourceId, mode, initial, fixed}). Works on the draft's
 * slots ({sourceId, page, matchedSizeCode, mm}). */
export function pickerTargetFor(which, { front, back }) {
  const own = which === "front" ? front : back;
  if (!own?.sourceId) return null;
  if (front?.sourceId != null && (!back || back.sourceId === front.sourceId)) {
    return { sourceId: front.sourceId, mode: "both", initial: initialChoiceFor(front, back), fixed: null };
  }
  const other = which === "front" ? back : front;
  return { sourceId: own.sourceId, mode: which, initial: { [which]: own.page }, fixed: slotAsPage(other) };
}

/** The bigger render of a page's thumbnail, for the enlarged view. */
export function enlargedThumbnailUrl(thumbnailUrl) {
  return `${thumbnailUrl}${thumbnailUrl.includes("?") ? "&" : "?"}size=large`;
}

/** An Artwork as the API returns it, read as a picker page, to compare Sizes with. */
export function artworkAsPage(artwork) {
  if (!artwork) return null;
  return { matched_size_code: artwork.matched_size_code ?? null, trim_width_mm: artwork.trim_width_mm, trim_height_mm: artwork.trim_height_mm };
}
