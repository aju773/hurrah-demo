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
 * feeds the size-mismatch dialog after the pages are chosen. */
export function evaluateChoice({ pages, front, back, orderedSize }) {
  const byNumber = (n) => pages.find((p) => p.number === n) ?? null;
  const frontPage = front == null ? null : byNumber(front);
  const backPage = back == null ? null : byNumber(back);
  const samePage = frontPage != null && backPage != null && front === back;
  const backSizeDiffers = frontPage != null && backPage != null && !samePage && !sameSize(frontPage, backPage);
  const differsFromOrder = (p) => Boolean(orderedSize) && p != null && p.matched_size_code !== orderedSize;
  return {
    frontPage,
    backPage,
    samePage,
    backSizeDiffers,
    frontDiffersFromOrder: differsFromOrder(frontPage),
    backDiffersFromOrder: differsFromOrder(backPage),
    canConfirm: frontPage != null && !samePage && !backSizeDiffers,
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
