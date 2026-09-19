"""Artwork analysis: reads a PDF's page geometry with pikepdf and matches it
against a Product's active Size Option values.

Rules (docs/.scratch/flyer-demo/issues/08-size-detection-rules.md):
- Page box = CropBox (or MediaBox if there is none), clipped to the MediaBox.
- Trim = TrimBox if present and smaller than the page box, else the page box.
- A real TrimBox that matches no Size is trusted: no bleed guessing on top of it.
- Without a real TrimBox: try an exact match on the page box first (either
  orientation); only if nothing matches, infer a uniform bleed within the
  Product's allowed range.
- Bleed reported = the smallest of the margins between the trim and the
  BleedBox (or the page box if there's no BleedBox), clipped to the MediaBox.
- Tolerance is +/- the Product's size_tolerance_mm on each axis, either way round.
- /Rotate (90/270 swap width and height) and /UserUnit are applied before measuring.

Runs in a process pool worker so a slow single-threaded parse doesn't block the
request thread that triggered the upload.
"""

import io
import re
from concurrent.futures import ProcessPoolExecutor

import pikepdf

PT_TO_MM = 25.4 / 72.0

# Float-rounding slack (points) when comparing box sizes, e.g. a TrimBox saved
# a hair off the CropBox by export-tool rounding shouldn't count as "not smaller".
EPSILON_PT = 0.5

TRIM_SOURCE_TRIMBOX = "trimbox"
TRIM_SOURCE_CROP = "crop"
TRIM_SOURCE_MEDIA = "media"
TRIM_SOURCE_MEDIA_MINUS_BLEED = "media_minus_bleed"

ERROR_NOT_A_PDF = "not_a_pdf"
ERROR_TOO_MANY_PAGES = "too_many_pages"
ERROR_BACK_ONE_PAGE = "back_one_page"
ERROR_BACK_SIZE_DIFFERS = "back_size_differs"
ERROR_SAME_PAGE_TWICE = "same_page_twice"
ERROR_INVALID_PAGE = "invalid_page"
ERROR_SOURCE_EXPIRED = "source_expired"
ERROR_NETWORK_FAILED = "network_failed"
ERROR_SERVER_BUSY = "server_busy"

MAX_PAGES = 50

# The server's English fallback for every customer-facing upload error code, each
# a reason plus a next step. The translated wording lives in the frontend message
# files (ArtworkErrors); file_unreadable and file_too_large are in views.py, from
# orders/preflight.py. network_failed is raised by the browser, never the server.
# same_page_twice, invalid_page and source_expired come from the Page picker's
# phase two (orders/source_views.py).
ERROR_MESSAGES_EN = {
    ERROR_NOT_A_PDF: "This file isn't a PDF. Save or export your design as a PDF, then upload that.",
    ERROR_TOO_MANY_PAGES: f"This PDF has more than {MAX_PAGES} pages. Keep only your flyer pages, save them as a new PDF, then upload that.",
    ERROR_BACK_ONE_PAGE: "Back takes one page. Upload a PDF with just the back.",
    ERROR_BACK_SIZE_DIFFERS: "Back must be the same size as front. Upload a back in the same size, or change the front.",
    ERROR_SAME_PAGE_TWICE: "Front and Back can't be the same page. Pick a different page for the back, or choose no back.",
    ERROR_INVALID_PAGE: "That page isn't in your file. Pick one of the pages shown.",
    ERROR_SOURCE_EXPIRED: "This upload has expired. Upload your file again.",
    ERROR_NETWORK_FAILED: "We couldn't reach the server. Check your connection, then try again.",
    ERROR_SERVER_BUSY: "We're busy right now. Wait a minute, then try again.",
}

PDF_HEADER = b"%PDF-"
# Readers accept the header anywhere in the first KB, after a short preamble.
PDF_HEADER_WINDOW = 1024


def looks_like_pdf(file_bytes):
    """Content sniff: a real PDF carries %PDF- near the start, whatever it is named."""
    return PDF_HEADER in file_bytes[:PDF_HEADER_WINDOW]


MAX_FILENAME_CHARS = 100
DEFAULT_FILENAME = "artwork.pdf"
# Path separators, shell/markup characters and control, bidi-override and
# zero-width characters (a name like "flyer\u202efdp.exe" would display reversed).
_UNSAFE_FILENAME_CHARS = re.compile(r'[\\/<>:"|?*\x00-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]')


def sanitise_filename(name):
    """A safe display and storage name for an uploaded file: no path, markup or
    control characters, at most MAX_FILENAME_CHARS long, always ending in .pdf
    (the content has already been checked to be a PDF)."""
    base = re.split(r"[\\/]", name or "")[-1]
    stem = base[:-4] if base.lower().endswith(".pdf") else base.rsplit(".", 1)[0] if "." in base else base
    stem = _UNSAFE_FILENAME_CHARS.sub("", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" .")
    stem = stem[: MAX_FILENAME_CHARS - len(".pdf")].strip(" .")
    return f"{stem}.pdf" if stem else DEFAULT_FILENAME


def _rect(box):
    return [float(v) for v in box]


def _intersect(a, b):
    return [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]


def _dims(rect):
    return abs(rect[2] - rect[0]), abs(rect[3] - rect[1])


def _fits_inside(inner, outer):
    """A real trim: strictly smaller than the outer box on at least one axis,
    and never bigger on either."""
    iw, ih = _dims(inner)
    ow, oh = _dims(outer)
    smaller = iw < ow - EPSILON_PT or ih < oh - EPSILON_PT
    not_bigger = iw <= ow + EPSILON_PT and ih <= oh + EPSILON_PT
    return smaller and not_bigger


def _match_size(w_mm, h_mm, size_values, tolerance_mm):
    """Exact match against a Product's Size values, checked in either orientation."""
    for value in size_values:
        sw, sh = value["width_mm"], value["height_mm"]
        if abs(w_mm - sw) <= tolerance_mm and abs(h_mm - sh) <= tolerance_mm:
            return value
        if abs(w_mm - sh) <= tolerance_mm and abs(h_mm - sw) <= tolerance_mm:
            return value
    return None


def _infer_bleed(w_mm, h_mm, size_values, tolerance_mm, bleed_min_mm, bleed_max_mm):
    """No exact match: try a uniform bleed within [bleed_min_mm, bleed_max_mm]
    against every Size, in either orientation."""
    for value in size_values:
        for sw, sh in ((value["width_mm"], value["height_mm"]), (value["height_mm"], value["width_mm"])):
            bleed_w = (w_mm - sw) / 2
            bleed_h = (h_mm - sh) / 2
            if abs(bleed_w - bleed_h) > tolerance_mm:
                continue
            bleed = min(bleed_w, bleed_h)
            if bleed_min_mm <= bleed <= bleed_max_mm:
                return value, round(bleed, 2)
    return None, None


def analyze_page(page, size_values, tolerance_mm, bleed_min_mm, bleed_max_mm):
    """Trim size, bleed, orientation and matched Size for one pikepdf page."""
    rotation = int(page.obj.get("/Rotate", 0)) % 360
    rotated = rotation in (90, 270)
    user_unit = float(page.obj.get("/UserUnit", 1))
    scale = PT_TO_MM * user_unit

    media = _rect(page.mediabox)
    has_crop = "/CropBox" in page
    crop = _rect(page.cropbox) if has_crop else media
    page_box = _intersect(crop, media) if has_crop else media

    has_trim = "/TrimBox" in page
    trim_box = _rect(page.trimbox) if has_trim else None
    real_trim = has_trim and _fits_inside(trim_box, page_box)

    if real_trim:
        trim_rect = trim_box
        trim_source = TRIM_SOURCE_TRIMBOX
    else:
        trim_rect = page_box
        trim_source = TRIM_SOURCE_CROP if has_crop else TRIM_SOURCE_MEDIA

    trim_w_pt, trim_h_pt = _dims(trim_rect)
    if rotated:
        trim_w_pt, trim_h_pt = trim_h_pt, trim_w_pt
    trim_w_mm = round(trim_w_pt * scale, 2)
    trim_h_mm = round(trim_h_pt * scale, 2)

    media_w_pt, media_h_pt = _dims(media)
    if rotated:
        media_w_pt, media_h_pt = media_h_pt, media_w_pt
    media_w_mm = round(media_w_pt * scale, 2)
    media_h_mm = round(media_h_pt * scale, 2)

    orientation = "landscape" if trim_w_mm > trim_h_mm else "portrait"

    matched_value = _match_size(trim_w_mm, trim_h_mm, size_values, tolerance_mm)

    # trim_rect_pt/bleed_outer_rect_pt below are in the PDF's own (unrotated)
    # point space — the same space pikepdf/pypdfium2 use for that page — for
    # Preflight's rendering-based edge check and image-placement math
    # (orders/preflight.py). They deliberately don't get the rotation-swap
    # applied to the *_mm fields above, which exist purely for display.
    if trim_source == TRIM_SOURCE_TRIMBOX:
        # A real TrimBox that matches nothing is trusted as-is: no bleed guessing.
        outer = _rect(page.bleedbox) if "/BleedBox" in page else page_box
        outer = _intersect(outer, media)
        margins_pt = [
            trim_rect[0] - outer[0],
            outer[2] - trim_rect[2],
            trim_rect[1] - outer[1],
            outer[3] - trim_rect[3],
        ]
        bleed_mm = round(max(0.0, min(margins_pt)) * scale, 2)
        trim_rect_pt = trim_rect
        bleed_outer_rect_pt = outer
    elif matched_value is not None:
        # Page box itself is an exact match: no bleed present.
        bleed_mm = 0.0
        trim_rect_pt = page_box
        bleed_outer_rect_pt = page_box
    else:
        inferred_value, inferred_bleed = _infer_bleed(
            trim_w_mm, trim_h_mm, size_values, tolerance_mm, bleed_min_mm, bleed_max_mm
        )
        if inferred_value is not None:
            matched_value = inferred_value
            trim_source = TRIM_SOURCE_MEDIA_MINUS_BLEED
            if orientation == "portrait":
                trim_w_mm, trim_h_mm = inferred_value["width_mm"], inferred_value["height_mm"]
            else:
                trim_w_mm, trim_h_mm = inferred_value["height_mm"], inferred_value["width_mm"]
            bleed_mm = inferred_bleed
            bleed_pt = inferred_bleed / scale if scale else 0.0
            trim_rect_pt = [
                page_box[0] + bleed_pt,
                page_box[1] + bleed_pt,
                page_box[2] - bleed_pt,
                page_box[3] - bleed_pt,
            ]
        else:
            bleed_mm = None
            trim_rect_pt = page_box
        bleed_outer_rect_pt = page_box

    return {
        "trim_source": trim_source,
        "trim_width_mm": trim_w_mm,
        "trim_height_mm": trim_h_mm,
        "media_width_mm": media_w_mm,
        "media_height_mm": media_h_mm,
        "bleed_mm": bleed_mm,
        "orientation": orientation,
        "rotation": rotation,
        "matched_size_id": matched_value["id"] if matched_value else None,
        "matched_size_code": matched_value["code"] if matched_value else None,
        "trim_rect_pt": trim_rect_pt,
        "media_rect_pt": media,
        "bleed_outer_rect_pt": bleed_outer_rect_pt,
    }


def analyze_pdf_bytes(file_bytes, size_values, tolerance_mm, bleed_min_mm, bleed_max_mm):
    """Runs in the worker process. Returns {"page_count", "pages": [...]}, or
    {"error": "not_a_pdf"} if the file can't be read as a PDF."""
    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes))
    except (pikepdf.PdfError, OSError):
        return {"error": ERROR_NOT_A_PDF}

    try:
        page_count = len(pdf.pages)
        if page_count == 0:
            return {"error": ERROR_NOT_A_PDF}
        pages = [
            analyze_page(page, size_values, tolerance_mm, bleed_min_mm, bleed_max_mm) for page in pdf.pages
        ]
    finally:
        pdf.close()

    return {"page_count": page_count, "pages": pages}


_executor = None


def _get_executor():
    global _executor
    if _executor is None:
        _executor = ProcessPoolExecutor(max_workers=2)
    return _executor


def analyze_pdf(file_obj, size_values, tolerance_mm, bleed_min_mm, bleed_max_mm, timeout=30):
    """Read `file_obj` (a Django UploadedFile or any file-like object) in a
    process pool worker. `size_values` is a list of plain dicts
    {id, code, width_mm, height_mm} for the Product's active Size values."""
    file_obj.seek(0)
    file_bytes = file_obj.read()
    future = _get_executor().submit(
        analyze_pdf_bytes, file_bytes, size_values, tolerance_mm, bleed_min_mm, bleed_max_mm
    )
    return future.result(timeout=timeout)
