"""Fit/Fill: the "keep ordered Size and resize my file" instruction (ticket 09,
.scratch/flyer-demo/issues/06-size-mismatch-handling.md "Fit and fill are
instructions, not new files"). Pure geometry — no file bytes touched, the
uploaded file is never rewritten. `orders/views.ArtworkPreviewView` calls this
to build the preview `transform` and to re-run Preflight on the scaled result
(orders/preflight.rescale_report).

Maths (per side; Back always matches Front's Size so the same call handles
both slots):
- Target = ordered Size in the file's orientation (orientation is not an
  Option, so a landscape file against a portrait order swaps the ordered
  width/height rather than mismatching).
- Fit: scale = min(target / file trim) on each axis, centred. White border =
  (target - scaled trim) / 2.
- Fill: scale = max((target + 2 * Product bleed) / (file trim + 2 * file
  bleed)) on each axis, centred. Crop = (scaled trim - target) / 2.

Both modes report the larger-axis border/crop (the other axis is ~0, since
the driving axis lands exactly on target) and which pair of edges it's on.
"""

FIT = "fit"
FILL = "fill"

# Rotate: a clockwise quarter turn (90°), stored beside the size choice as
# {"rotate": {"front": bool, "back": bool}}. It is separate from Orientation
# (which only records which way round the page already is). Like Fit/Fill it is
# an instruction — the preview and Preflight apply it, the file is never rewritten.
ROTATION_DEGREES = 90


def rotated_mm(size_mm, rotated):
    """A [width, height] pair as it lies after the quarter turn (unknown sizes pass through)."""
    return [size_mm[1], size_mm[0]] if rotated else list(size_mm)


def rotate_bbox_mm(bbox, trim_mm):
    """A Finding's [x0, y0, x1, y1] box (trim-mm, origin top-left, y down) after a
    clockwise quarter turn of the page whose trim is `trim_mm` [width, height]:
    (x, y) lands at (height - y, x). None stays None."""
    if bbox is None:
        return None
    x0, y0, x1, y1 = bbox
    height = trim_mm[1]
    return [round(height - y1, 2), x0, round(height - y0, 2), x1]


def clean_rotate(value, same_as_front, has_back):
    """The Rotate instruction as an Order line records it — {"front", "back"}
    booleans — or None when nothing is rotated or `value` is not one. A Back that
    is the Front again turns with it; a missing Back cannot be turned."""
    if not isinstance(value, dict):
        return None
    front = bool(value.get("front"))
    if same_as_front:
        back = front
    else:
        back = bool(value.get("back")) and has_back
    return {"front": front, "back": back} if front or back else None


def _target_trim_mm(ordered_trim_mm, file_trim_mm):
    ordered_w, ordered_h = ordered_trim_mm
    file_w, file_h = file_trim_mm
    ordered_landscape = ordered_w > ordered_h
    file_landscape = file_w > file_h
    if ordered_landscape == file_landscape:
        return ordered_w, ordered_h
    return ordered_h, ordered_w


def compute_size_choice(mode, ordered_trim_mm, file_trim_mm, file_bleed_mm, product_bleed_mm):
    """Returns {"mode", "scale", "scale_pct", "white_border_mm", "crop_mm",
    "edges"}. `edges` is ["top", "bottom"] or ["left", "right"] (whichever
    axis carries the border/crop), or None when it rounds to zero."""
    target_w, target_h = _target_trim_mm(ordered_trim_mm, file_trim_mm)
    file_w, file_h = file_trim_mm
    file_bleed_mm = file_bleed_mm or 0.0

    if mode == FIT:
        scale = min(target_w / file_w, target_h / file_h)
        border_w = (target_w - file_w * scale) / 2
        border_h = (target_h - file_h * scale) / 2
        border_mm = max(border_w, border_h)
        return {
            "mode": FIT,
            "scale": scale,
            "scale_pct": round(scale * 100, 1),
            "white_border_mm": round(border_mm, 1),
            "crop_mm": None,
            "edges": (["left", "right"] if border_w > border_h else ["top", "bottom"]) if border_mm > 0 else None,
        }

    if mode == FILL:
        scale = max(
            (target_w + 2 * product_bleed_mm) / (file_w + 2 * file_bleed_mm),
            (target_h + 2 * product_bleed_mm) / (file_h + 2 * file_bleed_mm),
        )
        crop_w = (file_w * scale - target_w) / 2
        crop_h = (file_h * scale - target_h) / 2
        crop_mm = max(crop_w, crop_h)
        return {
            "mode": FILL,
            "scale": scale,
            "scale_pct": round(scale * 100, 1),
            "white_border_mm": None,
            "crop_mm": round(crop_mm, 1),
            "edges": (["left", "right"] if crop_w > crop_h else ["top", "bottom"]) if crop_mm > 0 else None,
        }

    raise ValueError(f"mode must be {FIT!r} or {FILL!r}, got {mode!r}")
