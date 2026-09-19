"""Preview rendering: the page image and thumbnail stored beside an Artwork
for step 2's "Check & preview" (.scratch/flyer-demo-build/issues/07-check-and-preview-step.md).

Renders the same page pypdfium2 already opens for Preflight's bleed check
(orders/preflight._render_page_rgb), at 150 dpi for the page-box image and a
400px-longest-edge derivative for the thumbnail. Runs directly inside the
upload request, alongside Preflight, not through pdf_utils's process pool.
"""

import io

RENDER_DPI = 150.0
THUMBNAIL_LONGEST_EDGE_PX = 400
LARGE_THUMBNAIL_EDGE_PX = 1000  # the Page picker's enlarged view


def render_artwork_images(file_bytes, page_index):
    """PNG bytes for the page-box image (150 dpi) and its thumbnail (400px
    longest edge, never upscaled)."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(file_bytes)
    try:
        page = pdf[page_index - 1]
        bitmap = page.render(scale=RENDER_DPI / 72.0)
        image = bitmap.to_pil().convert("RGB")
    finally:
        pdf.close()

    page_buf = io.BytesIO()
    image.save(page_buf, format="PNG")

    width_px, height_px = image.size
    longest = max(width_px, height_px)
    if longest > THUMBNAIL_LONGEST_EDGE_PX:
        scale = THUMBNAIL_LONGEST_EDGE_PX / longest
        thumbnail = image.resize((max(1, round(width_px * scale)), max(1, round(height_px * scale))))
    else:
        thumbnail = image
    thumb_buf = io.BytesIO()
    thumbnail.save(thumb_buf, format="PNG")

    return {"page_png": page_buf.getvalue(), "thumbnail_png": thumb_buf.getvalue()}


# The page image is a convenience: past this the Artwork is kept without one.
RENDER_BUDGET_S = 10.0


def render_artwork_images_bounded(file_bytes, page_index):
    """render_artwork_images in the worker pool; None when it fails or runs out of time."""
    from .pdf_utils import run_bounded

    try:
        finished, images = run_bounded(render_artwork_images, file_bytes, page_index, timeout=RENDER_BUDGET_S)
    except Exception:
        return None
    return images if finished else None


def render_page_thumbnail(file_bytes, page_number, longest_edge_px=None):
    """PNG bytes of one page at 400px longest edge (or `longest_edge_px`), rendered straight at that size
    (no 150 dpi detour) so a Page picker with dozens of pages opens quickly."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(file_bytes)
    try:
        page = pdf[page_number - 1]
        width_pt, height_pt = page.get_size()
        scale = (longest_edge_px or THUMBNAIL_LONGEST_EDGE_PX) / max(width_pt, height_pt, 1)
        image = page.render(scale=scale).to_pil().convert("RGB")
    finally:
        pdf.close()
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()
