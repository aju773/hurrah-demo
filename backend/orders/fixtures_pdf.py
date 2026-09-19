"""Builds PDF fixtures for artwork-detection tests.

`build_pdf` is the general-purpose builder used across the test suite (front
end of the old pypdf-based `make_pdf` helper, now pikepdf-based). `build_f2`
builds the specific "F2" fixture from the ticket: a 2-page A5 flyer with a
148x210mm TrimBox, 3mm bleed, CMYK content and >=300ppi imagery.

Font embedding is best-effort: it looks for a Liberation/DejaVu TrueType font
on the host and embeds it if found, so the fixture is realistic where
possible, but nothing in this module or its tests depends on that succeeding
(font-related checks belong to the Preflight ticket, not this one).
"""

import io
import os

import pikepdf
from pikepdf import Array, Dictionary, Name, Page, Stream

MM_TO_PT = 72.0 / 25.4

_CANDIDATE_FONT_PATHS = [
    "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def mm(value):
    return value * MM_TO_PT


def _find_embeddable_font():
    for path in _CANDIDATE_FONT_PATHS:
        if os.path.exists(path):
            with open(path, "rb") as fh:
                return fh.read()
    return None


def _rgb_image_xobject(pdf, width_px, height_px, rgb=(90, 140, 200)):
    """A solid-fill DeviceRGB raw image XObject."""
    pixel = bytes(rgb)
    raw = pixel * (width_px * height_px)
    image = pdf.make_stream(raw)
    image.Type = Name.XObject
    image.Subtype = Name.Image
    image.Width = width_px
    image.Height = height_px
    image.BitsPerComponent = 8
    image.ColorSpace = Name.DeviceRGB
    return image


def _cmyk_image_xobject(pdf, width_px, height_px):
    """A solid-fill CMYK raw image XObject (no Pillow/zlib dependency needed
    for a flat fixture colour)."""
    # A light "process cyan" fill, one pixel of CMYK data tiled by the Do/cm scale.
    pixel = bytes([40, 10, 0, 0])  # C, M, Y, K out of 255
    raw = pixel * (width_px * height_px)
    image = pdf.make_stream(raw)
    image.Type = Name.XObject
    image.Subtype = Name.Image
    image.Width = width_px
    image.Height = height_px
    image.BitsPerComponent = 8
    image.ColorSpace = Name.DeviceCMYK
    return image


def _embed_font(pdf, font_bytes, base_font="LiberationSans"):
    """A minimal embedded TrueType font resource (FontFile2), referenced by a
    simple (non-subset) descriptor. Good enough for a fixture; not a
    production-grade font-subsetting pipeline."""
    font_file = pdf.make_stream(font_bytes)
    font_file.Length1 = len(font_bytes)

    descriptor = pdf.make_indirect(Dictionary(
        Type=Name.FontDescriptor,
        FontName=Name("/" + base_font),
        Flags=32,
        FontBBox=Array([0, -200, 1000, 900]),
        ItalicAngle=0,
        Ascent=900,
        Descent=-200,
        CapHeight=700,
        StemV=80,
        FontFile2=font_file,
    ))

    font = pdf.make_indirect(Dictionary(
        Type=Name.Font,
        Subtype=Name.TrueType,
        BaseFont=Name("/" + base_font),
        FirstChar=32,
        LastChar=255,
        Widths=Array([600] * (255 - 32 + 1)),
        FontDescriptor=descriptor,
    ))
    return font


def build_pdf(*pages):
    """Build an in-memory PDF. Each page is a dict:
    - media=(w, h) mm (required)
    - trim=(l, b, r, t) mm (optional /TrimBox)
    - bleed=(l, b, r, t) mm (optional /BleedBox)
    - rotate=90|180|270 (optional /Rotate)
    - user_unit=float (optional /UserUnit)
    Returns a BytesIO positioned at 0.
    """
    pdf = pikepdf.new()
    for spec in pages:
        w, h = spec["media"]
        page_dict = pdf.make_indirect(Dictionary(
            Type=Name.Page,
            MediaBox=Array([0, 0, mm(w), mm(h)]),
            Resources=Dictionary(),
        ))
        page = Page(page_dict)
        pdf.pages.append(page)

        if "trim" in spec:
            page.obj.TrimBox = Array([mm(v) for v in spec["trim"]])
        if "bleed" in spec:
            page.obj.BleedBox = Array([mm(v) for v in spec["bleed"]])
        if "crop" in spec:
            page.obj.CropBox = Array([mm(v) for v in spec["crop"]])
        if spec.get("rotate"):
            page.obj.Rotate = spec["rotate"]
        if "user_unit" in spec:
            page.obj.UserUnit = spec["user_unit"]

    buffer = io.BytesIO()
    pdf.save(buffer)
    buffer.seek(0)
    return buffer


def build_f2():
    """F2: a 2-page A5 flyer. TrimBox 148x210mm, 3mm bleed on every side (so
    MediaBox/BleedBox is 154x216mm), CMYK content, an image at >=300ppi, and an
    embedded font where the host has one available."""
    trim_w, trim_h = 148.0, 210.0
    bleed = 3.0
    media_w, media_h = trim_w + 2 * bleed, trim_h + 2 * bleed

    # >=300ppi over the full bleed area.
    ppi = 300
    width_px = round(media_w / 25.4 * ppi)
    height_px = round(media_h / 25.4 * ppi)

    pdf = pikepdf.new()
    font_bytes = _find_embeddable_font()
    font = _embed_font(pdf, font_bytes) if font_bytes else None

    for _ in range(2):
        page_dict = pdf.make_indirect(Dictionary(
            Type=Name.Page,
            MediaBox=Array([0, 0, mm(media_w), mm(media_h)]),
            Resources=Dictionary(XObject=Dictionary(), Font=Dictionary()),
        ))
        page = Page(page_dict)
        pdf.pages.append(page)
        page.obj.TrimBox = Array([mm(bleed), mm(bleed), mm(bleed + trim_w), mm(bleed + trim_h)])
        page.obj.BleedBox = Array([0, 0, mm(media_w), mm(media_h)])

        image = _cmyk_image_xobject(pdf, width_px, height_px)
        page.obj.Resources.XObject.Im0 = image
        content = f"q {mm(media_w):.2f} 0 0 {mm(media_h):.2f} 0 0 cm /Im0 Do Q".encode()

        if font is not None:
            page.obj.Resources.Font.F1 = font
            content += f" BT /F1 12 Tf 10 10 Td (F2 fixture) Tj ET".encode()

        page.obj.Contents = pdf.make_stream(content)

    buffer = io.BytesIO()
    pdf.save(buffer)
    buffer.seek(0)
    return buffer


def build_f1():
    """F1: a 2-page A4 flyer, no TrimBox (page box matches A4 exactly, so no
    bleed), a full-page grey fill (a coloured trim edge — `bleed_missing`), an
    RGB logo at ~200ppi (`low_ppi` Warning + `rgb_colour` Note), and bilingual
    EN/AR text on an embedded font where the host has one available (fonts
    OK). A realistic RGB Canva-style export, per the Preflight ticket."""
    trim_w, trim_h = 210.0, 297.0  # A4, exact match: no TrimBox, no bleed.

    logo_mm = 50.0  # >2% of the A4 trim area, comfortably inside it.
    ppi = 200
    logo_px = round(logo_mm / 25.4 * ppi)

    pdf = pikepdf.new()
    font_bytes = _find_embeddable_font()
    english_font = _embed_font(pdf, font_bytes, base_font="DemoSansEN") if font_bytes else None
    arabic_font = _embed_font(pdf, font_bytes, base_font="DemoSansAR") if font_bytes else None

    for _ in range(2):
        page_dict = pdf.make_indirect(Dictionary(
            Type=Name.Page,
            MediaBox=Array([0, 0, mm(trim_w), mm(trim_h)]),
            Resources=Dictionary(XObject=Dictionary(), Font=Dictionary()),
        ))
        page = Page(page_dict)
        pdf.pages.append(page)

        logo = _rgb_image_xobject(pdf, logo_px, logo_px)
        page.obj.Resources.XObject.Logo = logo

        # A light-grey full-page fill: a coloured edge with no bleed margin.
        # rg takes 0..1 components (200/255 ~= 0.784), well under the 245/255
        # "non-white" threshold the bleed edge check uses.
        content = f"0.784 0.784 0.784 rg 0 0 {mm(trim_w):.2f} {mm(trim_h):.2f} re f".encode()
        content += f" q {mm(logo_mm):.2f} 0 0 {mm(logo_mm):.2f} {mm(20):.2f} {mm(20):.2f} cm /Logo Do Q".encode()

        if english_font is not None and arabic_font is not None:
            page.obj.Resources.Font.FEn = english_font
            page.obj.Resources.Font.FAr = arabic_font
            content += b" BT /FEn 14 Tf 20 250 Td (Flyer sale) Tj ET"
            content += b" BT /FAr 14 Tf 20 230 Td (Arabic text placeholder) Tj ET"

        page.obj.Contents = pdf.make_stream(content)

    buffer = io.BytesIO()
    pdf.save(buffer)
    buffer.seek(0)
    return buffer


def build_f3(user_password="secret"):
    """F3: a single-page A5 PDF encrypted with a user password — Preflight's
    `file_unreadable` Error."""
    buffer = build_pdf({"media": (148, 210)})
    pdf = pikepdf.open(buffer)
    encrypted = io.BytesIO()
    pdf.save(encrypted, encryption=pikepdf.Encryption(user=user_password, owner="owner-secret"))
    pdf.close()
    encrypted.seek(0)
    return encrypted


def build_f4():
    """F4: F2's print-ready A5 flyer with a wrong startxref offset, so the file is
    damaged but repairable: Preflight reconstructs it and adds a `file_repaired`
    Warning (everything else stays OK)."""
    data = build_f2().read()
    index = data.rindex(b"startxref")
    tail = data[index:].split(b"\n")
    tail[1] = b"9"
    return io.BytesIO(data[:index] + b"\n".join(tail))


def build_five_page_mixed():
    """A 5-page PDF with mixed sizes where the flyer is on pages 3 and 4, for the
    page picker: an A4 cover, an A6 divider, then an A5 Front and Back (148x210mm
    TrimBox with 3mm bleed, like F2), then an A4 closing page."""
    flyer = {"media": (154, 216), "trim": (3, 3, 151, 213), "bleed": (0, 0, 154, 216)}
    return build_pdf({"media": (210, 297)}, {"media": (105, 148)}, flyer, flyer, {"media": (210, 297)})
