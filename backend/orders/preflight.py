"""Preflight: the automatic checks run on an Artwork slot (bleed, placed-image
ppi, embedded fonts, colour space, file readability) and their Findings.

Rules (.scratch/flyer-demo/issues/09-preflight-checks-and-severity.md):
- Severities: OK (not recorded as a Finding), Note, Warning, Error.
- A Finding is recorded per occurrence (e.g. one per low-ppi image).
- ppi is measured from pixel size x the full transformation matrix, following
  `cm`/`Do` through nested Form XObjects, not pdfium's page-level metadata
  (wrong for rotated images).
- The bleed edge test renders a 1mm-wide strip at 72dpi (=1 PDF point per
  pixel, since PDF space is already 1/72in) and calls it "coloured" when more
  than 2% of its pixels have any channel below 245/255.
- Everything runs against a 15s wall-clock budget; running out produces a
  `check_incomplete` Warning rather than a partial silent report.

pikepdf/pypdfium2 auto-apply a page's /Rotate when opening/rendering. The
bleed-edge renderer below assumes an unrotated page (matching the geometry
`orders/pdf_utils.analyze_page` hands it); a rotated page's bleed edge is not
checked (documented limitation — the ppi check, which works from vectors
rather than pixel positions, is unaffected by /Rotate).
"""

import io
import math
import time

import pikepdf
from pikepdf import Name

OK = "ok"
NOTE = "note"
WARNING = "warning"
ERROR = "error"

_SEVERITY_RANK = {OK: 0, NOTE: 1, WARNING: 2, ERROR: 3}

MAX_UPLOAD_MB = 100
CHECK_BUDGET_S = 15.0
# run_preflight only looks at the clock between checks; one slow check (a huge page
# render) can overrun, so the caller stops waiting this long after the budget.
OVERRUN_GRACE_S = 5.0

MESSAGES_EN = {
    ("bleed_missing", WARNING): "Your design goes to the edge but has no extra margin, so a thin white line may show after cutting.",
    ("bleed_short", WARNING): "Your file doesn't have enough bleed, so a thin white line may show.",
    ("low_ppi", WARNING): "An image is low resolution, so it may look a little soft.",
    ("low_ppi", ERROR): "An image is very low resolution and will print blurry.",
    ("font_not_embedded", ERROR): "A font isn't included, so text would print in the wrong font.",
    ("rgb_colour", NOTE): "Your file uses screen colours; we'll convert them for print, and bright blues and greens may look slightly duller.",
    ("file_repaired", WARNING): "Your file was damaged; we repaired it, so check the preview carefully.",
    ("file_unreadable", ERROR): "We couldn't open this file. If it's password-protected, remove the password; otherwise export it again as a PDF, then upload that.",
    ("file_too_large", ERROR): f"Files can be up to {MAX_UPLOAD_MB} MB. Reduce the image quality or export a smaller PDF, then upload that.",
    ("check_incomplete", WARNING): "We couldn't finish checking your file; our team will check it.",
    ("fit_border", WARNING): "Your design is shrunk to fit, leaving a white border.",
    ("fill_crop", WARNING): "Your design is enlarged to fill, cutting off the edges.",
}

FIT_BORDER_WARN_MM = 1.0
FILL_CROP_WARN_MM = 1.0

# Error-severity codes serious enough to actually block Continue/Submit. Every
# other Error still shows red and still needs the customer's "I accept" tick
# (order_views._warning_codes), but no longer stops them ordering (owner
# instruction 2026-09: only un-embedded/un-outlined fonts must be fixed first).
BLOCKING_CODES = {"font_not_embedded"}


def has_blocking_error(findings):
    return any(f["severity"] == ERROR and f["code"] in BLOCKING_CODES for f in findings)


def _message(code, severity):
    return MESSAGES_EN.get((code, severity), "")


def finding(code, severity, value=None, slot=None, page=None, bbox=None):
    return {
        "code": code,
        "severity": severity,
        "value": value,
        "slot": slot,
        "page": page,
        "bbox": bbox,
        "message": _message(code, severity),
    }


def headline_severity(findings):
    worst = OK
    for f in findings:
        if _SEVERITY_RANK[f["severity"]] > _SEVERITY_RANK[worst]:
            worst = f["severity"]
    return worst


def build_report(findings, thresholds):
    return {
        "findings": findings,
        "thresholds": thresholds,
        "headline_severity": headline_severity(findings),
    }


# ---- Rotate re-check ----------------------------------------------------

def rotate_report(base_report, trim_mm):
    """Re-makes a stored report for a clockwise quarter turn of the page (Rotate,
    .scratch/flyer-two-page-journey/issues/05-rotate-artwork.md): each Finding's
    box is turned within the file's trim `trim_mm` [width, height] so it sits
    where the customer now sees it. Nothing else depends on which way up the page
    is, so the Findings and headline are otherwise the same. Returns a new report
    (the stored one is left alone) flagged `rotation: 90`."""
    from .size_choice import ROTATION_DEGREES, rotate_bbox_mm

    findings = [{**f, "bbox": rotate_bbox_mm(f.get("bbox"), trim_mm)} for f in base_report.get("findings", [])]
    return {**build_report(findings, base_report.get("thresholds", {})), "rotation": ROTATION_DEGREES}


# ---- Fit/Fill re-check (ticket 09) --------------------------------------

def rescale_report(base_report, size_choice, product_bleed_mm, slot, page):
    """Re-runs Preflight against a Fit/Fill instruction, from the already-
    stored `base_report` rather than re-rendering the file
    (.scratch/flyer-demo/issues/09-preflight-checks-and-severity.md, "After
    Fit or Fill"): the bleed check is skipped (it was judged on the raw file,
    which the instruction only scales/crops on print, not re-renders), each
    `low_ppi` Finding's value is divided by the scale and re-judged against
    the same thresholds, and a `fit_border`/`fill_crop` Warning is added when
    the border/crop from `size_choice` (orders/size_choice.compute_size_choice)
    crosses its 1mm floor.

    `size_choice` is that function's return value. Findings are otherwise
    passed through unchanged (fonts, colour, file-level)."""
    thresholds = base_report.get("thresholds", {})
    findings = []
    for f in base_report.get("findings", []):
        if f["code"] in ("bleed_missing", "bleed_short"):
            continue
        if f["code"] == "low_ppi" and f.get("value") is not None:
            new_value = round(f["value"] / size_choice["scale"])
            if new_value < thresholds["ppi_error_below"]:
                severity = ERROR
            elif new_value < thresholds["ppi_warn_below"]:
                severity = WARNING
            else:
                continue  # scaling brought it back to OK: drop the Finding
            findings.append({**f, "value": new_value, "severity": severity, "message": _message("low_ppi", severity)})
            continue
        findings.append(f)

    mode = size_choice["mode"]
    if mode == "fit" and (size_choice.get("white_border_mm") or 0) >= FIT_BORDER_WARN_MM:
        findings.append(finding("fit_border", WARNING, value=size_choice["white_border_mm"], slot=slot, page=page))
    elif mode == "fill":
        crop_past_bleed = (size_choice.get("crop_mm") or 0) - product_bleed_mm
        if crop_past_bleed >= FILL_CROP_WARN_MM:
            findings.append(finding("fill_crop", WARNING, value=round(crop_past_bleed, 1), slot=slot, page=page))

    return build_report(findings, thresholds)


# ---- file-level checks ------------------------------------------------

def check_file(file_bytes, max_mb=None):
    """Only intercepts encryption and size — a plain corrupt/non-PDF file is
    left to the existing detection pipeline (orders/pdf_utils), which already
    classifies it as `not_a_pdf`.

    Returns {"status": "too_large" | "unreadable" | "ok", "repaired": bool}.
    """
    if max_mb is None:
        max_mb = MAX_UPLOAD_MB  # read at call time, not import time, so tests can patch it
    if len(file_bytes) > max_mb * 1024 * 1024:
        return {"status": "too_large", "repaired": False}

    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes))
    except pikepdf.PasswordError:
        return {"status": "unreadable", "repaired": False}
    except Exception:
        return {"status": "ok", "repaired": False}

    try:
        repaired = bool(pdf.get_warnings()) and len(pdf.pages) > 0
    finally:
        pdf.close()
    return {"status": "ok", "repaired": repaired}


# ---- geometry helpers ---------------------------------------------------

def _mat_mul(m1, m2):
    """Combined matrix "apply m1, then m2" under PDF's row-vector convention."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    )


def _apply(point, m):
    x, y = point
    a, b, c, d, e, f = m
    return (x * a + y * c + e, x * b + y * d + f)


def _rect_intersect(a, b):
    return (max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3]))


def _rect_area(r):
    w = max(0.0, r[2] - r[0])
    h = max(0.0, r[3] - r[1])
    return w * h


# ---- content-stream walk (images, fonts used, vector RGB) ---------------

def _lookup(resources, group, name):
    if resources is None:
        return None
    try:
        group_dict = resources.get(Name(group))
    except Exception:
        return None
    if group_dict is None:
        return None
    try:
        return group_dict[name]
    except (KeyError, TypeError):
        return None


def _walk_content(stream_obj, resources, ctm, images_out, fonts_out, flags, depth=0):
    if depth > 12:
        return
    try:
        instructions = pikepdf.parse_content_stream(stream_obj)
    except Exception:
        return

    stack = []
    cur_ctm = ctm
    for operands, operator in instructions:
        op = str(operator)
        if op == "q":
            stack.append(cur_ctm)
        elif op == "Q":
            if stack:
                cur_ctm = stack.pop()
        elif op == "cm" and len(operands) == 6:
            m = tuple(float(v) for v in operands)
            cur_ctm = _mat_mul(m, cur_ctm)
        elif op in ("rg", "RG"):
            flags["vector_rgb"] = True
        elif op == "Tf" and operands:
            font_obj = _lookup(resources, "/Font", operands[0])
            if font_obj is not None:
                fonts_out.append(font_obj)
        elif op == "Do" and operands:
            xobj = _lookup(resources, "/XObject", operands[0])
            if xobj is None:
                continue
            subtype = xobj.get("/Subtype")
            if subtype == Name.Image:
                images_out.append({"ctm": cur_ctm, "xobject": xobj})
            elif subtype == Name.Form:
                try:
                    matrix = tuple(float(v) for v in xobj.get("/Matrix", [1, 0, 0, 1, 0, 0]))
                except Exception:
                    matrix = (1, 0, 0, 1, 0, 0)
                form_ctm = _mat_mul(matrix, cur_ctm)
                form_resources = xobj.get("/Resources", resources)
                _walk_content(xobj, form_resources, form_ctm, images_out, fonts_out, flags, depth + 1)


def _page_content(page):
    images, fonts, flags = [], [], {"vector_rgb": False}
    resources = page.obj.get("/Resources")
    _walk_content(page, resources, (1, 0, 0, 1, 0, 0), images, fonts, flags)
    return images, fonts, flags["vector_rgb"]


# ---- bleed --------------------------------------------------------------

STRIP_PX = max(1, round(72.0 / 25.4))  # ~1mm at 72dpi


def _render_page_rgb(file_bytes, page_index):
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(file_bytes)
    try:
        page = pdf[page_index - 1]
        bitmap = page.render(scale=1.0)
        return bitmap.to_pil().convert("RGB")
    finally:
        pdf.close()


def _is_coloured(pil_image, rect_px, strip_px=STRIP_PX):
    """Whether more than 2% of the pixels in a `strip_px`-wide band along the
    perimeter of `rect_px` (x0, y0, x1, y1; top-left origin) are non-white
    (any channel < 245)."""
    width, height = pil_image.size
    x0, y0, x1, y1 = rect_px
    x0, x1 = sorted((max(0, min(width, x0)), max(0, min(width, x1))))
    y0, y1 = sorted((max(0, min(height, y0)), max(0, min(height, y1))))
    if x1 - x0 < 1 or y1 - y0 < 1:
        return False

    px = pil_image.load()
    total = 0
    non_white = 0

    def sample(x, y):
        nonlocal total, non_white
        total += 1
        r, g, b = px[x, y]
        if r < 245 or g < 245 or b < 245:
            non_white += 1

    top_h = min(strip_px, y1 - y0)
    bot_h = min(strip_px, y1 - y0 - top_h)
    for y in range(y0, y0 + top_h):
        for x in range(x0, x1):
            sample(x, y)
    for y in range(y1 - bot_h, y1):
        for x in range(x0, x1):
            sample(x, y)

    mid_y0, mid_y1 = y0 + top_h, y1 - bot_h
    left_w = min(strip_px, x1 - x0)
    right_w = min(strip_px, x1 - x0 - left_w)
    for y in range(mid_y0, mid_y1):
        for x in range(x0, x0 + left_w):
            sample(x, y)
        for x in range(x1 - right_w, x1):
            sample(x, y)

    return total > 0 and (non_white / total) > 0.02


def _rect_pt_to_px(rect_pt, media_rect_pt):
    mx0, my0, _mx1, my1 = media_rect_pt
    x0, y0, x1, y1 = rect_pt
    px0 = x0 - mx0
    px1 = x1 - mx0
    # top-left, y-down: the rect's top (pdf y1) becomes the smaller pixel y.
    py0 = (my1 - y1)
    py1 = (my1 - y0)
    return (round(px0), round(py0), round(px1), round(py1))


def check_bleed(pil_image, media_rect_pt, trim_rect_pt, bleed_outer_rect_pt, bleed_mm, product_bleed_mm, slot, page):
    findings = []
    trim_px = _rect_pt_to_px(trim_rect_pt, media_rect_pt)

    if bleed_mm is not None and bleed_mm >= product_bleed_mm:
        outer_px = _rect_pt_to_px(bleed_outer_rect_pt, media_rect_pt)
        trim_coloured = _is_coloured(pil_image, trim_px)
        bleed_strip_coloured = _is_coloured(pil_image, outer_px)
        if trim_coloured and not bleed_strip_coloured:
            findings.append(finding("bleed_missing", WARNING, value=bleed_mm, slot=slot, page=page))
    elif bleed_mm is not None and bleed_mm >= 1.0:
        findings.append(finding("bleed_short", WARNING, value=bleed_mm, slot=slot, page=page))
    else:
        if _is_coloured(pil_image, trim_px):
            findings.append(finding("bleed_missing", WARNING, value=bleed_mm or 0.0, slot=slot, page=page))

    return findings


# ---- image resolution -----------------------------------------------

def _bbox_to_trim_mm(bbox_pt, trim_rect_pt):
    tx0, ty0, _tx1, ty1 = trim_rect_pt
    x0, y0, x1, y1 = bbox_pt
    return [
        round((x0 - tx0) * pikepdf_pt_to_mm, 2),
        round((ty1 - y1) * pikepdf_pt_to_mm, 2),
        round((x1 - tx0) * pikepdf_pt_to_mm, 2),
        round((ty1 - y0) * pikepdf_pt_to_mm, 2),
    ]


pikepdf_pt_to_mm = 25.4 / 72.0


def check_ppi(images, trim_rect_pt, bleed_outer_rect_pt, thresholds, slot, page):
    findings = []
    trim_area = _rect_area(trim_rect_pt)

    for img in images:
        ctm = img["ctm"]
        a, b, c, d, _e, _f = ctm
        placed_w_pt = math.hypot(a, b)
        placed_h_pt = math.hypot(c, d)
        if placed_w_pt <= 0 or placed_h_pt <= 0:
            continue

        corners = [_apply(p, ctm) for p in ((0, 0), (1, 0), (0, 1), (1, 1))]
        xs = [p[0] for p in corners]
        ys = [p[1] for p in corners]
        bbox_pt = (min(xs), min(ys), max(xs), max(ys))

        if _rect_area(_rect_intersect(bbox_pt, bleed_outer_rect_pt)) <= 0:
            continue  # fully outside the bleed box
        visible_area = _rect_area(_rect_intersect(bbox_pt, trim_rect_pt))
        if trim_area > 0 and visible_area / trim_area < 0.02:
            continue  # < 2% of the trim area visible

        xobj = img["xobject"]
        try:
            px_w = int(xobj.get("/Width", 0))
            px_h = int(xobj.get("/Height", 0))
        except Exception:
            continue
        if px_w <= 0 or px_h <= 0:
            continue

        ppi_x = px_w / (placed_w_pt / 72.0)
        ppi_y = px_h / (placed_h_pt / 72.0)
        effective_ppi = min(ppi_x, ppi_y)
        bbox_mm = _bbox_to_trim_mm(bbox_pt, trim_rect_pt)

        if effective_ppi < thresholds["ppi_error_below"]:
            findings.append(finding("low_ppi", ERROR, value=round(effective_ppi), slot=slot, page=page, bbox=bbox_mm))
        elif effective_ppi < thresholds["ppi_warn_below"]:
            findings.append(finding("low_ppi", WARNING, value=round(effective_ppi), slot=slot, page=page, bbox=bbox_mm))

    return findings


# ---- fonts ----------------------------------------------------------

def _font_descriptor(font_obj):
    subtype = font_obj.get("/Subtype")
    if subtype == Name.Type0:
        try:
            descendant = font_obj["/DescendantFonts"][0]
            return descendant.get("/FontDescriptor")
        except Exception:
            return None
    return font_obj.get("/FontDescriptor")


def _font_is_embedded(font_obj):
    descriptor = _font_descriptor(font_obj)
    if descriptor is None:
        return False
    return any(key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3"))


def check_fonts(fonts_used, slot, page):
    findings = []
    seen = set()
    for font_obj in fonts_used:
        key = font_obj.objgen if hasattr(font_obj, "objgen") else id(font_obj)
        if key in seen:
            continue
        seen.add(key)
        if not _font_is_embedded(font_obj):
            name = str(font_obj.get("/BaseFont", "Unknown")).lstrip("/")
            findings.append(finding("font_not_embedded", ERROR, value=name, slot=slot, page=page))
    return findings


# ---- colour -----------------------------------------------------------

def _is_rgbish_colorspace(cs):
    if cs is None:
        return False
    try:
        if isinstance(cs, pikepdf.Name):
            return cs in (Name.DeviceRGB, Name.CalRGB)
        if isinstance(cs, pikepdf.Array):
            head = cs[0]
            if head == Name.ICCBased:
                stream = cs[1]
                n = int(stream.get("/N", 0))
                alternate = stream.get("/Alternate")
                return n == 3 or alternate in (Name.DeviceRGB, Name.CalRGB)
            return head in (Name.CalRGB, Name.Lab)
    except Exception:
        return False
    return False


def check_colour(images, vector_rgb_used, slot, page):
    findings = []
    if vector_rgb_used:
        findings.append(finding("rgb_colour", NOTE, value="vector", slot=slot, page=page))
    for img in images:
        if _is_rgbish_colorspace(img["xobject"].get("/ColorSpace")):
            findings.append(finding("rgb_colour", NOTE, value="image", slot=slot, page=page))
    return findings


# ---- orchestration ------------------------------------------------------

def run_preflight(file_bytes, page_index, geometry, thresholds, slot, budget_s=CHECK_BUDGET_S, file_repaired=False):
    """Runs every check for one Artwork slot/page against a wall-clock budget.

    `geometry` is the subset of orders/pdf_utils.analyze_page's result for
    this page: trim_rect_pt, media_rect_pt, bleed_outer_rect_pt, bleed_mm.
    `thresholds` is {"bleed_mm", "ppi_error_below", "ppi_warn_below"} — the
    Product's Preflight fields. Returns a report dict (see build_report).
    """
    deadline = time.monotonic() + budget_s
    findings = []

    if file_repaired:
        findings.append(finding("file_repaired", WARNING, slot=slot, page=page_index))

    def out_of_time():
        return time.monotonic() > deadline

    trim_rect_pt = geometry.get("trim_rect_pt")
    media_rect_pt = geometry.get("media_rect_pt")
    bleed_outer_rect_pt = geometry.get("bleed_outer_rect_pt") or media_rect_pt
    bleed_mm = geometry.get("bleed_mm")

    incomplete = out_of_time()

    if not incomplete and trim_rect_pt and media_rect_pt:
        try:
            pil_image = _render_page_rgb(file_bytes, page_index)
            findings += check_bleed(
                pil_image, media_rect_pt, trim_rect_pt, bleed_outer_rect_pt, bleed_mm, thresholds["bleed_mm"], slot, page_index
            )
        except Exception:
            pass
        incomplete = out_of_time()

    images, fonts_used, vector_rgb = [], [], False
    if not incomplete:
        try:
            pdf = pikepdf.open(io.BytesIO(file_bytes))
        except Exception:
            pdf = None
        if pdf is not None:
            # The image/font XObjects gathered below stay backed by this Pdf
            # (their FontDescriptor/ColorSpace lookups need it open), so it's
            # only closed once every check that reads them has run.
            try:
                page = pdf.pages[page_index - 1]
                images, fonts_used, vector_rgb = _page_content(page)
                incomplete = out_of_time()

                if not incomplete and trim_rect_pt:
                    findings += check_ppi(images, trim_rect_pt, bleed_outer_rect_pt, thresholds, slot, page_index)
                    incomplete = out_of_time()

                if not incomplete:
                    findings += check_fonts(fonts_used, slot, page_index)
                    incomplete = out_of_time()

                if not incomplete:
                    findings += check_colour(images, vector_rgb, slot, page_index)
                    incomplete = out_of_time()
            finally:
                pdf.close()
        else:
            # The same bytes just opened fine for file-level checks and
            # geometry detection; failing to reopen them here means ppi/font/
            # colour couldn't run at all, not that they ran clean — surface
            # that rather than silently reporting the slot as OK.
            incomplete = True

    if incomplete:
        findings.append(finding("check_incomplete", WARNING, slot=slot, page=page_index))

    return build_report(findings, thresholds)


def run_preflight_bounded(file_bytes, page_index, geometry, thresholds, slot, file_repaired=False):
    """run_preflight in the worker pool, given up on when it overruns its budget:
    the slot then gets the same "couldn't finish checking" Warning a cooperative
    stop gives, so a very large file never blocks the customer."""
    from .pdf_utils import run_bounded

    finished, report = run_bounded(
        run_preflight,
        file_bytes,
        page_index,
        geometry,
        thresholds,
        slot,
        CHECK_BUDGET_S,
        file_repaired,
        timeout=CHECK_BUDGET_S + OVERRUN_GRACE_S,
    )
    if finished:
        return report
    findings = [finding("file_repaired", WARNING, slot=slot, page=page_index)] if file_repaired else []
    findings.append(finding("check_incomplete", WARNING, slot=slot, page=page_index))
    return build_report(findings, thresholds)
