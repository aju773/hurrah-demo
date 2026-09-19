"""Artwork templates: a downloadable 2-page PDF (Front, Back) for each active
Size of a Product, so a designer starts on the right page size.

Each page is the Trim size plus the Product's Bleed on every side, with its
TrimBox at the cut line and its BleedBox at the page edge. Guides are drawn for
the cut line (solid), the Bleed edge (dashed) and the Safe area (dotted), and the
Bleed area is tinted so a template already has coloured Bleed. Labels give the
Size name and measurements in English and Arabic.

Labels are drawn as 1-bit image masks (rendered with Pillow from the bundled
fonts in orders/fonts/), never as PDF text, so a template has no font resources
and cannot trigger Preflight's `font_not_embedded` Error. All colours are CMYK,
so it cannot trigger the `rgb_colour` Note. Uploading an unmodified template
therefore gives an exact Size match, Bleed at the Product value and no Findings.

Templates are built from live catalogue data on demand and cached by a key made
of every value that shapes the PDF, so a change to a Size, the Bleed, the Safe
area or a label is a different key and the template is built again.
"""

import hashlib
import io
import json
import zlib
from pathlib import Path

import pikepdf
from django.core.cache import cache
from PIL import Image, ImageDraw, ImageFont, features
from pikepdf import Array, Dictionary, Name, Page

MM_TO_PT = 72.0 / 25.4

FONT_DIR = Path(__file__).parent / "fonts"
LATIN_FONT = FONT_DIR / "LiberationSans-Regular.ttf"
ARABIC_FONT = FONT_DIR / "NotoSansArabic-Regular.ttf"

# Labels are small, so they are cheap to draw at a resolution well above any
# Preflight ppi threshold.
LABEL_PPI = 1200

# Bumped when the drawing changes, so cached templates are rebuilt.
TEMPLATE_VERSION = 1
CACHE_SECONDS = 24 * 60 * 60

TITLE_MM = 6.0
LINE_MM = 3.2
MIN_TEXT_MM = 1.2
LINE_GAP_MM = 2.0
BLOCK_GAP_MM = 5.0

# CMYK. The Bleed area is a light tint so it can never read as white paper.
BLEED_TINT = "0 0.10 0.10 0 k"
PAPER = "0 0 0 0 k"
LABEL_INK = "0 0 0 0.75 k"
CUT_INK = "0 0 0 1 K"
BLEED_INK = "0 1 1 0 K"
SAFE_INK = "1 0 1 0 K"

SIDE_LABELS = {
    "front": ("Front", "الوجه الأمامي"),
    "back": ("Back", "الوجه الخلفي"),
}


def active_sizes(product):
    """The Product's active Size values that have a trim size, in display order."""
    size_option = product.options.filter(code="size", active=True).first()
    if size_option is None:
        return []
    return [
        value
        for value in size_option.values.filter(active=True).order_by("sort_order")
        if value.width_mm is not None and value.height_mm is not None
    ]


def _num(value):
    return f"{value:g}"


def cache_key(product, size):
    shaping = {
        "v": TEMPLATE_VERSION,
        "product": product.slug,
        "size": size.code,
        "label_en": size.label_en,
        "label_ar": size.label_ar,
        "width_mm": size.width_mm,
        "height_mm": size.height_mm,
        "bleed_mm": product.bleed_mm,
        "safe_mm": product.safe_mm,
    }
    digest = hashlib.sha256(json.dumps(shaping, sort_keys=True).encode()).hexdigest()
    return f"artwork-template:{digest}"


def template_pdf(product, size):
    """The template's bytes: from the cache, else built now and cached."""
    key = cache_key(product, size)
    pdf_bytes = cache.get(key)
    if pdf_bytes is None:
        pdf_bytes = build_template_pdf(size.label_en, size.label_ar, size.width_mm, size.height_mm, product.bleed_mm, product.safe_mm)
        cache.set(key, pdf_bytes, CACHE_SECONDS)
    return pdf_bytes


def template_filename(product, size):
    return f"hurrah-{product.slug}-{size.code}-template.pdf"


# ---- labels -----------------------------------------------------------------

def _arabic_shaping_available():
    return features.check("raqm")


def _font(path, size_mm, arabic):
    size_px = max(1, round(size_mm / 25.4 * LABEL_PPI))
    engine = ImageFont.Layout.RAQM if arabic else ImageFont.Layout.BASIC
    return ImageFont.truetype(str(path), size_px, layout_engine=engine)


def _label_mask(text, size_mm, max_width_mm, arabic):
    """One line of text as a 1-bit image mask: (PIL image, width_mm, height_mm).
    The size shrinks until the line fits `max_width_mm`."""
    path = ARABIC_FONT if arabic else LATIN_FONT
    kwargs = {"direction": "rtl", "language": "ar"} if arabic else {}
    while True:
        font = _font(path, size_mm, arabic)
        left, top, right, bottom = font.getbbox(text, **kwargs)
        width_mm = (right - left) / LABEL_PPI * 25.4
        if width_mm <= max_width_mm or size_mm <= MIN_TEXT_MM:
            break
        size_mm = max(MIN_TEXT_MM, size_mm * 0.9)
    pad = 2
    canvas = Image.new("L", (right - left + 2 * pad, bottom - top + 2 * pad), 0)
    ImageDraw.Draw(canvas).text((pad - left, pad - top), text, font=font, fill=255, **kwargs)
    # In an image mask a 0 sample paints, so the glyphs are 0 and the rest 1.
    mask = canvas.point(lambda v: 0 if v > 127 else 255).convert("1")
    return mask, mask.width / LABEL_PPI * 25.4, mask.height / LABEL_PPI * 25.4


def _label_lines(label_en, label_ar, width_mm, height_mm, bleed_mm, safe_mm, side):
    """[(text, size_mm, arabic)]: the English block, then the Arabic block. Arabic
    lines carry only Arabic words, digits and Arabic punctuation: the Arabic font
    has no Latin letters, so the Latin Size name stays in the English block."""
    side_en, side_ar = SIDE_LABELS[side]
    size = f"{_num(width_mm)} × {_num(height_mm)}"
    lines = [
        (f"{label_en} · {side_en}", TITLE_MM, False),
        (f"Trim {size} mm · Bleed {_num(bleed_mm)} mm · Safe area {_num(safe_mm)} mm", LINE_MM, False),
        ("Solid line: cut · Dashed: bleed edge · Dotted: safe area", LINE_MM, False),
    ]
    if _arabic_shaping_available():
        size_ar = f"{_num(width_mm)} في {_num(height_mm)}"
        title_ar = f"{label_ar} ، {side_ar}" if label_ar else side_ar
        lines += [
            (title_ar, TITLE_MM, True),
            (f"مقاس القص: {size_ar} مم ، الهامش: {_num(bleed_mm)} مم ، المنطقة الآمنة: {_num(safe_mm)} مم", LINE_MM, True),
            ("خط متصل: القص ، متقطع: حد الهامش ، منقط: المنطقة الآمنة", LINE_MM, True),
        ]
    return lines


# ---- the PDF ----------------------------------------------------------------

def _mask_xobject(pdf, mask):
    stream = pdf.make_stream(b"")
    stream.write(zlib.compress(mask.tobytes()), filter=Name.FlateDecode)
    stream.Type = Name.XObject
    stream.Subtype = Name.Image
    stream.Width = mask.width
    stream.Height = mask.height
    stream.ImageMask = True
    stream.BitsPerComponent = 1
    return stream


def _rect_op(x, y, w, h):
    return f"{x:.3f} {y:.3f} {w:.3f} {h:.3f} re"


def _page_content(width_mm, height_mm, bleed_mm, safe_mm, placements):
    """The page's content stream. Units are PDF points; the origin is the page's bottom left."""
    b = bleed_mm * MM_TO_PT
    w = width_mm * MM_TO_PT
    h = height_mm * MM_TO_PT
    page_w = w + 2 * b
    page_h = h + 2 * b
    s = safe_mm * MM_TO_PT

    ops = [
        f"{BLEED_TINT} {_rect_op(0, 0, page_w, page_h)} f",
        f"{PAPER} {_rect_op(b, b, w, h)} f",
        "0.5 w",
        # Bleed edge: dashed, drawn half a line width inside the page so it is not clipped.
        f"{BLEED_INK} [4 3] 0 d {_rect_op(0.25, 0.25, page_w - 0.5, page_h - 0.5)} S",
        # Cut line: solid.
        f"{CUT_INK} [] 0 d {_rect_op(b, b, w, h)} S",
    ]
    if 2 * s < min(w, h):
        # Safe area: dotted (round dots).
        ops.append(f"{SAFE_INK} 1 J 0.9 w [0 3] 0 d {_rect_op(b + s, b + s, w - 2 * s, h - 2 * s)} S 0 J [] 0 d 0.5 w")
    ops.append(LABEL_INK)
    for name, x, y, img_w, img_h in placements:
        ops.append(f"q {img_w:.3f} 0 0 {img_h:.3f} {x:.3f} {y:.3f} cm /{name} Do Q")
    return "\n".join(ops).encode()


def _layout(masks, width_mm, height_mm, bleed_mm):
    """Stacks the label masks, centred on the trim: [(name, x_pt, y_pt, w_pt, h_pt)]."""
    gaps = 0.0
    previous_arabic = None
    for _mask, _w, _h, arabic in masks:
        if previous_arabic is not None:
            gaps += BLOCK_GAP_MM if arabic != previous_arabic else LINE_GAP_MM
        previous_arabic = arabic
    total = sum(h for _m, _w, h, _a in masks) + gaps
    centre_x = bleed_mm + width_mm / 2
    top = bleed_mm + height_mm / 2 + total / 2

    placements = []
    previous_arabic = None
    for index, (_mask, w, h, arabic) in enumerate(masks):
        if previous_arabic is not None:
            top -= BLOCK_GAP_MM if arabic != previous_arabic else LINE_GAP_MM
        placements.append((f"Label{index}", (centre_x - w / 2) * MM_TO_PT, (top - h) * MM_TO_PT, w * MM_TO_PT, h * MM_TO_PT))
        top -= h
        previous_arabic = arabic
    return placements


def build_template_pdf(label_en, label_ar, width_mm, height_mm, bleed_mm, safe_mm):
    """A 2-page template PDF (Front, Back) as bytes."""
    max_text_mm = width_mm - 2 * safe_mm
    if max_text_mm <= 0:
        max_text_mm = width_mm * 0.8

    pdf = pikepdf.new()
    page_w_mm = width_mm + 2 * bleed_mm
    page_h_mm = height_mm + 2 * bleed_mm

    for side in ("front", "back"):
        masks = []
        for text, size_mm, arabic in _label_lines(label_en, label_ar, width_mm, height_mm, bleed_mm, safe_mm, side):
            mask, w, h = _label_mask(text, size_mm, max_text_mm, arabic)
            masks.append((mask, w, h, arabic))
        placements = _layout(masks, width_mm, height_mm, bleed_mm)

        xobjects = Dictionary()
        for (name, *_), (mask, _w, _h, _a) in zip(placements, masks):
            xobjects[f"/{name}"] = _mask_xobject(pdf, mask)

        page = Page(pdf.make_indirect(Dictionary(
            Type=Name.Page,
            MediaBox=Array([0, 0, page_w_mm * MM_TO_PT, page_h_mm * MM_TO_PT]),
            Resources=Dictionary(XObject=xobjects),
        )))
        pdf.pages.append(page)
        page.obj.BleedBox = Array([0, 0, page_w_mm * MM_TO_PT, page_h_mm * MM_TO_PT])
        page.obj.TrimBox = Array([
            bleed_mm * MM_TO_PT,
            bleed_mm * MM_TO_PT,
            (bleed_mm + width_mm) * MM_TO_PT,
            (bleed_mm + height_mm) * MM_TO_PT,
        ])
        page.obj.Contents = pdf.make_stream(_page_content(width_mm, height_mm, bleed_mm, safe_mm, placements))

    buffer = io.BytesIO()
    pdf.save(buffer)
    return buffer.getvalue()
