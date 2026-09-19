# PDF Library Capability on Our Stack — pypdfium2 + pikepdf

- **Date checked:** 2026-09-17
- **Ticket:** [.scratch/flyer-demo/issues/10-pdf-library-capability-on-stack.md](../../.scratch/flyer-demo/issues/10-pdf-library-capability-on-stack.md)
- **Stack tested:** CPython 3.14.7 (`/usr/bin/python3.14`, the same interpreter as `backend/venv/pyvenv.cfg`), Linux x86_64, glibc 2.44. We used a throwaway venv in the session scratchpad. Nothing was installed into `backend/venv` and no project code changed.
- **Versions tested:** pypdfium2 **5.13.0** (bundled PDFium 153.0.7999.0), pikepdf **10.13.0.post1** (libqpdf 12.3.2), Pillow 12.3.0, reportlab 5.0.1 (only used to build fixtures).
- **Method:** PyPI JSON API for wheel tags; installed package source and upstream GitHub/PDFium source for API behaviour; hands-on probes against 5 unique sample PDFs from `backend/media/uploads/` plus 15 synthetic PDFs and 2 large PDFs (139 MB and 71 MB).
- **Limits:** The scratchpad is on **tmpfs** (RAM), so timings leave out disk I/O. RSS numbers come from `ru_maxrss` (`/usr/bin/time` is not installed). Every sample upload is a simple Illustrator/pypdf export: none has real bleed, RGB images, missing fonts or encryption. Those cases were covered with synthetic files only.

---

## TL;DR

- **Both install cleanly on Python 3.14 with binary wheels. No compiler needed.** pypdfium2 ships `py3-none-manylinux_2_17_x86_64` wheels (ctypes, works on any Python version). pikepdf ships `cp314-abi3-manylinux_2_27_x86_64` (and `cp314t`) wheels.
- **Every demo check works when the two libraries are combined.** Neither one covers everything alone:
  - **pdfium:** rendering, font embedding status, and image pixel size, colour space and matrix. It also opens owner-password-only PDFs and reports permissions.
  - **pikepdf:** page boxes and `/Rotate` resolved correctly through page-tree inheritance, `/UserUnit`, OutputIntents, vector colour operators (`rg`/`k`), and **repair of damaged files that pdfium refuses to open**.
- **Three real traps, all confirmed by test:**
  1. **pdfium `get_*box()` ignores inherited boxes.** A MediaBox set on the `/Pages` node came back as a fake **US Letter** fallback (215.9×279.4 mm) instead of A5 ([crbug 1786](https://crbug.com/pdfium/1786)). Read boxes with pikepdf.
  2. **pdfium `PdfImage.get_metadata()` DPI is wrong for rotated images.** It divides pixel size by the *axis-aligned bounding box* ([fpdf_editimg.cpp](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/fpdfsdk/fpdf_editimg.cpp)). A 300×150 px image drawn 200×100 pt and rotated 90° reported 216×54 dpi; the truth is 108×108. Work it out from `get_matrix()` instead; that gives the right answer.
  3. **`pikepdf.get_objects_with_ctm()` multiplies matrices in the wrong order** (`ctm @ cm` instead of `cm @ ctm`). It gives the same wrong 216×54 dpi and a nonsense translation (e=60000). It also skips Form XObjects and inline images. Do not use it for DPI.
- **Speed is fine for flyers.** On a 139 MB, 2-page PDF: pikepdf open + boxes takes **1 ms / +1 MB**; pdfium open + boxes takes **~90 ms / +133 MB**; a 72 dpi render of page 1 takes **~0.5–0.9 s / +185 MB peak**. pdfium memory grows with the compressed image bytes of the pages it loads, not with page count.
- **Recommendation:** use **pikepdf for structure** (open/repair, encryption, boxes, rotation, UserUnit, fonts cross-check, colour ops, OutputIntents) and **pdfium for pixels and objects** (image DPI via matrices, image colour space, `is_embedded`, PNG render). Run pdfium in a **separate process** (Celery worker or `ProcessPoolExecutor`), never in threads.

---

## Install/wheel status on Python 3.14

| Package | Latest (PyPI, 2026-09-17) | Linux x86_64 wheel for 3.14 | How it binds | Source |
|---|---|---|---|---|
| pypdfium2 | 5.13.0 (uploaded 2026-08-13), `requires_python >=3.6` | `pypdfium2-5.13.0-py3-none-manylinux_2_17_x86_64.manylinux2014_x86_64.whl` (3.7 MB). Also aarch64, armv7l, i686, ppc64le, s390x, riscv64 and musllinux builds | ctypes + bundled `libpdfium.so`. Tag is `py3-none`, so the wheel does not depend on the Python version, including 3.14 | [PyPI JSON](https://pypi.org/pypi/pypdfium2/json) |
| pikepdf | 10.13.0.post1 (uploaded 2026-09-05), `requires_python >=3.10` | `pikepdf-10.13.0.post1-cp314-abi3-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl` (2.3 MB), plus `cp314-cp314t` (free-threaded) and musllinux/aarch64 | nanobind C++ extension `_core.abi3.so` wrapping bundled qpdf | [PyPI JSON](https://pypi.org/pypi/pikepdf/json); README: wheels "including free-threaded (no-GIL) CPython 3.14" ([README](https://github.com/pikepdf/pikepdf/blob/main/README.md)) |

What we did: `python3.14 -m venv` followed by `pip install pypdfium2 pikepdf`. Pip chose exactly the two wheels above, with nothing built from source. Both imported and ran. pikepdf pulled in `lxml`, `packaging` and `Pillow` as dependencies.

Deployment notes:
- pikepdf's manylinux_2_27 tag needs glibc ≥ 2.27. Debian 10+ and Ubuntu 18.04+ images meet this.
- Alpine images get the musllinux wheels.

---

## Capability table

Legend: **works** = correct on every test file; **partial** = works with a workaround or has a known hole; **no** = not available.

| Check | pypdfium2 5.13.0 | pikepdf 10.13.0.post1 |
|---|---|---|
| **Page boxes (Media/Crop/Bleed/Trim/Art)** | **partial**. `PdfPage.get_mediabox/get_cropbox/get_bleedbox/get_trimbox(fallback_ok=False)` returns the explicit box or `None`; fallbacks follow ISO. **Does not inherit from the page tree**, and a missing MediaBox silently falls back to Letter `(0,0,612,792)`. Tested: wrong. `get_bbox()` (Media∩Crop) does inherit. [page.py](https://github.com/pypdfium2-team/pypdfium2/blob/5.13.0/src/pypdfium2/_helpers/page.py), [crbug 1786](https://crbug.com/pdfium/1786) | **works**. `Page.mediabox/cropbox/bleedbox/trimbox/artbox` give the *effective* box (Trim/Bleed/Art → CropBox → MediaBox) and resolve inherited values. Use `'/TrimBox' in page.obj` to tell explicit from default. [models docs](https://pikepdf.readthedocs.io/en/latest/api/models.html) |
| **`/Rotate`** | **works**. `get_rotation()` resolves inheritance (tested). `get_size()` returns the *rotated* size, but the boxes are *unrotated*. | **works**. `Page.rotation` is the effective, inherited value normalised to [0,360) (added in 10.9). [_core.pyi / models docs](https://pikepdf.readthedocs.io/en/latest/api/models.html) |
| **UserUnit** | **no**. No API exists, and boxes, `get_size()` and render all ignore it (a UserUnit=2 A5 page read as 74×105 mm and rendered at half size). | **works (manual)**. `float(page.obj.get('/UserUnit', 1.0))`, then multiply box sizes by it. |
| **On-page image effective DPI** | **works via matrix; partial via metadata.** `PdfImage.get_metadata().horizontal_dpi/vertical_dpi` is right for unrotated images, including ones nested in Form XObjects and inline images (tested), but **wrong for rotated or skewed images** because it uses the axis-aligned rect ([fpdf_editimg.cpp L502–513](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/fpdfsdk/fpdf_editimg.cpp)). Correct method: `get_px_size()` + `get_matrix()`, multiplied down through form objects: dpi = px ÷ (‖(a,b)‖/72). [pageobjects.py](https://github.com/pypdfium2-team/pypdfium2/blob/5.13.0/src/pypdfium2/_helpers/pageobjects.py) | **partial**. `get_objects_with_ctm()` has a matrix-order bug (tested), doesn't recurse into forms and ignores inline images ([ctm.py L75–80](https://github.com/pikepdf/pikepdf/blob/v10.13.0.post1/src/pikepdf/models/ctm.py)). You would need your own content-stream interpreter. |
| **Fonts embedded** | **works**. Walk `page.get_objects()`, then for text objects `obj.get_font().is_embedded` and `get_base_name()`. Only reports fonts actually *used* by text objects. | **works (manual)**. Walk `/Resources/Font` (recurse into forms; handle Type0 → `DescendantFonts[0]`) and check that `FontDescriptor` has `/FontFile`, `/FontFile2` or `/FontFile3`. Also lists unused fonts; Type3 fonts need special handling. |
| **Image colour space** | **works**. `get_metadata().colorspace` → `FPDF_COLORSPACE_*` (DeviceRGB/CMYK/Gray, ICCBased, Lab, Separation, …). Tested RGB, CMYK, Gray (inline) and ICCBased. `bits_per_pixel` is the *decoded* bpp (CMYK read as 24). | **works**. `PdfImage(obj).colorspace` (`/DeviceRGB`, `/ICCBased`, …), `.icc` (Pillow `ImageCmsProfile`; tested "sRGB built-in"), `.bits_per_component`, `.filters`. `page.get_images()` recurses into forms. [image docs](https://pikepdf.readthedocs.io/en/latest/topics/images.html) |
| **Vector/text colour space** | **no**. Only `FPDFPageObj_GetFillColor` (RGBA values, no colour space). | **works (manual)**. `pikepdf.parse_content_stream(page)` and count `rg/RG` (RGB), `k/K` (CMYK), `g/G`, `cs/scn`; resolve `/ColorSpace` resources. Tested on Flyer.pdf: 1395 `k`, 12 `g`, 0 `rg`. |
| **OutputIntent / PDF/X claim** | no | **works**: `pdf.Root.get('/OutputIntents')` |
| **Encrypted (user password)** | **works**. Raises `PdfiumError`, `err_code=4` ("Incorrect password"); opens with `password=`. | **works**. Raises `pikepdf.PasswordError`; opens with `password=`. |
| **Encrypted (owner password only)** | **works**. Opens without a password. `raw.FPDF_GetDocPermissions(doc)` and `FPDF_GetSecurityHandlerRevision` expose the restrictions (tested: rev 6, high-res print bit off). | **works**. Opens; `pdf.is_encrypted`, `pdf.allow.print_highres`, `pdf.encryption` (R/V/method). |
| **Damaged / non-PDF** | **partial**. Rebuilds a broken `startxref` or shifted offsets (tested). **Truncated file: fails** (`err_code=3` "Data format error"). Empty or JPEG-as-PDF: fails with `err_code=3`. | **works (best)**. qpdf reconstructs the xref for broken `startxref`, shifted offsets **and truncated files** (recovered 1 page, some objects `None`), with `pdf.get_warnings()` listing what happened. `pdf.save()` writes a repaired copy **that pdfium then opens** (tested). Empty or JPEG-as-PDF: `PdfError`. |
| **Render page → PNG** | **works**. `page.render(scale=dpi/72).to_pil().save()`. Handles /Rotate and CMYK→RGB; non-embedded fonts are substituted silently. [page.py render()](https://github.com/pypdfium2-team/pypdfium2/blob/5.13.0/src/pypdfium2/_helpers/page.py) | **no** (no renderer) |
| **Page count** | works, `len(doc)` | works, `len(pdf.pages)` |

---

## Test results

Scripts (scratchpad, throwaway): `gen.py` (fixtures), `probe.py` (both libraries, all checks), `extra.py` (CTM order, ICC, permissions, inheritance, repair), `matrix_dpi.py` (matrix-based DPI), `genbig.py` + `bench.py` (performance).

### Sample uploads (`backend/media/uploads/2026/09/17/`)

The 10 files are 5 unique ones (by md5).

| File | Result (both libraries agree unless noted) |
|---|---|
| `sample-flyer-a4.pdf` (445 B, pypdf) | 1 page, MediaBox 210.0×297.0 mm, no Trim/Bleed, no fonts or images. Rendered 596×842. |
| `sample-letter.pdf` | 215.9×279.4 mm. Note: pdfium's "no MediaBox" fallback returns the same Letter size, so a Letter result from pdfium is ambiguous. |
| `bad_size.pdf` | 200×200 pt = 70.6×70.6 mm |
| `02_Offline_MARKETING.pdf` (1.9 MB, 5 pages) | Explicit Media=Crop=Bleed=Trim = A4 (so **"TrimBox present" does not mean bleed exists**: here Bleed = Trim). MyriadPro-Bold/BoldIt/Regular all embedded (pikepdf shows subset prefix `WHIUHA+`). Colour ops CMYK `k` only. |
| `Flyer.pdf` (6.1 MB, 2 pages) | Media=Crop=Bleed=Trim = A4. p1 image 327×284 px DeviceCMYK at **300.8×301.0 dpi**; p2 313×272 px at 300.1×300.5 dpi (pdfium metadata, pdfium matrix and pikepdf CTM agree: the images are unrotated). Montserrat-SemiBold, Poppins-Bold, KohinoorGujarati-Semibold all embedded. 1395 `k` + 12 `g` ops, no RGB. p1 uses 11 Form XObjects and p2 uses 50. Rendered correctly (Gujarati text shaped). |

### Synthetic files

| Fixture | Expected | pdfium | pikepdf |
|---|---|---|---|
| `a5_trim_bleed.pdf`: MediaBox A5+10 mm, TrimBox A5, BleedBox trim+3 mm | Trim 148×210, Bleed 154×216 | ✔ exact | ✔ exact |
| `rotate90.pdf` | rot 90 | ✔ `get_rotation()=90`; `get_size()` swapped (595×420); render 596×420 landscape | ✔ `rotation=90` |
| `inherited_box.pdf`: MediaBox + Rotate only on `/Pages` | A5, rot 90 | ✘ **boxes = Letter fallback**, `fallback_ok=False` → `None`; rotation ✔ 90; `get_bbox()` ✔ A5 | ✔ A5, rot 90 |
| `userunit2.pdf`: A5 as 74×105 units, UserUnit 2 | 148×210 mm | ✘ 74×105 mm, render 210×298 px | ✔ with manual `×UserUnit` |
| `images_mixed.pdf`: 100×70 RGB stretched to page width via nested `cm`; 591 px CMYK at 50 mm; 400 px JPEG rotated 90° (square); same low-res image inside a 2× Form XObject; 8×8 inline gray image | 17.2 / 300.2 / 288 / 50×35 / 7.2 dpi | ✔ all five via `get_metadata()` and via matrix | CTM helper ✔ for the 3 top-level images (commuting matrices); ✘ misses form image and inline image |
| `ctm_order_icc.pdf`: 300×150 px ICCBased image, `rotate90 cm` then `200 0 0 100 cm` | **108×108 dpi** | ✘ metadata **216×54**; ✔ matrix method 108×108; colourspace 7 (ICCBased) | ✘ `get_objects_with_ctm` → `Matrix(0,100,-200,0,60000,0)` → **216×54**; ✔ `colorspace=/ICCBased`, ICC "sRGB built-in" |
| `fonts_rl.pdf`: embedded Liberation Sans TTF + Standard-14 Helvetica | LibSans embedded, Helvetica not | ✔ `{'LiberationSans': True, 'Helvetica': False}` | ✔ `{'/AAAAAA+LiberationSans': True, '/Helvetica': False}` |
| `font_not_embedded.pdf`: TrueType ArialMT, no FontFile | not embedded | ✔ False; render substitutes a font silently | ✔ False |
| `encrypted_userpw.pdf` (AES-256 R6) | needs password | ✔ `err_code=4`; opens with `password="secret"` | ✔ `PasswordError`; opens with password |
| `encrypted_owneronly.pdf` (no high-res print, no extract) | opens, restricted | ✔ opens; perms `0xfffff3ec`, rev 6 | ✔ opens; `allow.print_highres=False` |
| `damaged_xref.pdf` (`startxref` keyword broken) | recover | ✔ | ✔ (3 warnings) |
| `damaged_offsets.pdf` (500 junk bytes shift every offset) | recover | ✔ | ✔ (3 warnings) |
| `damaged_truncated.pdf` (first 60 %) | partial recover | ✘ `Data format error` | ✔ opens with 9 warnings; 2 of 4 XObjects become `None` (**naive code crashes with `AttributeError`**). Saving and reopening in pdfium works (2 images left) |
| `empty.pdf`, `not_a_pdf.pdf` (JPEG bytes) | reject | ✔ `err_code=3` | ✔ `PdfError: unable to find trailer dictionary` |

Renders were checked by eye (contact sheet): the bleed fill reaches the BleedBox, the rotated page is landscape, the CMYK image converted plausibly, and substituted Arial had wrong spacing, which is exactly why unembedded fonts must be an error.

### Surprises

1. PDFium's box getters ignore page-tree inheritance. They return **plausible but wrong** Letter dimensions with no error, so a size check would report "wrong size: Letter".
2. PDFium's `get_metadata()` DPI uses the bounding box, so rotated images produce swapped or wrong DPI values. 45° rotations would *understate* DPI.
3. pikepdf's built-in CTM helper has matrix multiplication reversed (still reversed on `main` as of 2026-09-17). It is only right when all matrices commute (pure scale/translate stacks, which is the common case, and why it looked fine on Flyer.pdf).
4. PDFium ignores `/UserUnit` everywhere.
5. `get_metadata()` reports decoded `bits_per_pixel` (CMYK read as 24). Do not use bpp to detect CMYK; use `colorspace`.

---

## Performance numbers

Setup: fresh process per run, 3 runs, warm page cache on tmpfs. Baseline RSS after importing both libraries is **28.6 MB**. "Δ peak" = peak RSS minus baseline.

Big fixtures:
- `flate_cmyk.pdf`: **139.3 MB**, 2 A4 pages, each one 3508×4961 CMYK noise image (Flate, ~70 MB compressed), ≈424 dpi.
- `jpeg_rgb.pdf`: **70.8 MB**, 3 A4 pages, each one 5000×7070 RGB JPEG (~23 MB), ≈605 dpi.

| Task | flate_cmyk 139 MB: time (min–max) | Δ peak | jpeg_rgb 71 MB: time | Δ peak | Flyer.pdf 6 MB (2 p, ~60 forms): time | Δ peak |
|---|---|---|---|---|---|---|
| **pikepdf** open + boxes + rotation (all pages) | **1 ms** | **+1.3 MB** | 1 ms | +1.3 MB | 3 ms | +1.5 MB |
| **pdfium** open (path) + boxes (all pages) | 85–101 ms | +133 MB | 29–31 ms | +68 MB | 73–79 ms | +16 MB |
| pdfium open from `bytes` + boxes | 204–221 ms | +266 MB | 49–50 ms | +136 MB | 75 ms | +22 MB |
| **pdfium DPI scan**, `get_metadata()` | 121–157 ms | +200 MB | 51–67 ms | +91 MB | 98–99 ms | +16 MB |
| **pdfium DPI scan**, `get_px_size()` + `get_matrix()` | **61–64 ms** | +133 MB | 31–35 ms | +68 MB | 97–102 ms | +16 MB |
| pikepdf DPI scan, `get_objects_with_ctm` (top level only) | 1–9 ms | +1.5 MB | 1 ms | +1.5 MB | **347–352 ms** | +52 MB |
| **pdfium render page 1 @ 72 dpi → PNG** (596×842) | 542–879 ms | +185 MB | 465–473 ms | +60 MB | 83–88 ms | +12 MB |
| pdfium render page 1 @ 150 dpi (1241×1754, no save) | 439–473 ms | +190 MB | 423–436 ms | +78 MB | 69–72 ms | +23 MB |

Reading the numbers:
- **pikepdf/qpdf is lazy.** Open + boxes costs about 1 ms and ~1 MB regardless of file size. Its content-stream parsing runs in Python per operator, though, so it gets slow on vector-heavy pages (Flyer.pdf: 0.35 s for 1,600 ops).
- **pdfium loads each page's stream data into memory when the page is parsed.** Loading page 0 alone of the 139 MB file cost +67 MB anonymous RSS (`/proc/self/smaps_rollup`), the same whether opened by path or by file object. Iterating every page keeps all of them (+133 MB). Opening from `bytes` adds a second copy of the file (+266 MB). **Open by path, not `request.FILES[...].read()`.**
- `get_metadata()` costs about 2× the matrix method and extra memory, because it starts decoding each image to find bpp/colour space ([source](https://pdfium.googlesource.com/pdfium/+/refs/heads/main/fpdfsdk/fpdf_editimg.cpp), and pypdfium2 warns it "might be slow on some kinds of images").
- **Render time is dominated by decoding the full-resolution image.** Output DPI barely matters: 72 dpi and 150 dpi both take ~0.45 s on a 35 M-pixel CMYK image. Peak ≈ compressed stream + decoded image.
- **Extrapolating (not tested): a 250 MB single-page upload means roughly 0.5–1 GB peak in a pdfium worker.** Cap upload size and set a per-worker memory limit.

---

## Gotchas

1. **pdfium is not thread-safe, even across different documents.** "It is not allowed to call pdfium functions simultaneously across different threads, not even with different documents … consider processes instead of threads" ([pypdfium2 API docs, Incompatibility with Threading](https://pypdfium2.readthedocs.io/en/stable/python_api.html)). Under gunicorn `gthread` or any threaded Celery pool this **crashes or corrupts the process**. Use a prefork/process pool, or a global lock.
2. **pikepdf and threads:** individual calls are serialised per `Pdf` on free-threaded builds, and multi-step edits need `with pdf.lock():` ([_methods.py `Pdf.lock`](https://github.com/pikepdf/pikepdf/blob/v10.13.0.post1/src/pikepdf/_methods.py)). The file must not be modified by another thread or process while open, because data is lazily loaded ([Pdf.open docs](https://pikepdf.readthedocs.io/en/latest/api/main.html)). For read-only preflight, use one `Pdf` per task.
3. **pdfium boxes don't inherit** ([crbug 1786](https://crbug.com/pdfium/1786)), and the MediaBox fallback is Letter. Never trust `get_mediabox()` without `fallback_ok=False` and a cross-check; take boxes from pikepdf.
4. **pdfium `get_size()` is rotated, boxes are not.** Pick one convention: compare *unrotated* TrimBox dimensions against the ordered size in either orientation, and apply `/Rotate` only for display.
5. **UserUnit:** only pikepdf sees it. Multiply the box sizes, and tell pdfium's render scale about it too (or just reject UserUnit ≠ 1 for the demo; it is very rare in print files).
6. **CTM maths.**
   - PDF uses row vectors: `cm` sets **CTM′ = CM × CTM**. pikepdf's `Matrix` follows the same convention (`A @ B` applies A first; tested `scale(2) @ translate(10)` → `(2,0,0,1,10,0)`), so the correct update is `cm @ ctm`. pikepdf's own `get_objects_with_ctm` does `ctm @ cm` ([ctm.py L80](https://github.com/pikepdf/pikepdf/blob/v10.13.0.post1/src/pikepdf/models/ctm.py)).
   - Effective DPI must use vector lengths, `px_w / (hypot(a,b)/72)` and `px_h / (hypot(c,d)/72)`, not bounding-box width/height.
   - Form XObjects add their `/Matrix`. pdfium already folds that into the form object's `get_matrix()`, so multiply child matrix × form-object matrix (tested, 50×35 dpi correct).
   - pdfium exposes form children only through raw `FPDFFormObj_CountObjects/GetObject`; `page.get_objects(max_depth=…)` flattens them but loses the parent chain. Walk the tree yourself when using matrices.
7. **qpdf recovery can leave `None` objects.** Guard every `.get()` on resources after a repaired open, and treat `pdf.get_warnings()` as a "file was damaged" signal worth showing the customer ("we repaired your file, please check the proof").
8. **Owner-password PDFs open silently** in both libraries. Printing them is technically fine (the restriction is advisory), but log the permissions.
9. **Non-embedded fonts render anyway**, with a substitute. The render looks "almost right", so the font check must block, not the preview.
10. **Standard-14 fonts** (Helvetica etc.) report not-embedded. pypdfium2 exposes `PdfFont.STANDARD_FONTS`. Decide policy (recommend: warn, not error).
11. **Memory tracks compressed image bytes on loaded pages.** Close pdfium pages/documents promptly (`with pdfium.PdfDocument(path) as doc:`) and process only the pages you need.
12. **`PdfiumError.err_code`** is the stable way to classify failures: 3 = format/damaged, 4 = password, 5 = unsupported security handler.

---

## Recommendation for the demo preflight engine

**Adopt both, with a clear split, in a process-isolated worker.** Add to `backend/requirements` when the build ticket starts: `pypdfium2==5.13.*`, `pikepdf==10.13.*`.

Suggested pipeline per upload (maps to research §5.2 demo checks 1–5, 7 and 9):

1. **Open with pikepdf** (path, not bytes).
   - `PasswordError` → ⛔ "file is password-protected".
   - `PdfError` → ⛔ "not a readable PDF".
   - Warnings present → save a repaired copy to a temp path and use *that* for the next steps; show ⚠️ "we repaired your file".
2. **pikepdf structure checks:**
   - Page count vs sides.
   - Effective TrimBox → CropBox → MediaBox × UserUnit, unrotated, ±1 mm either orientation.
   - Whether TrimBox/BleedBox are *explicit* and BleedBox ≥ Trim + 2.5 mm.
   - `page.rotation`.
   - Fonts: walk FontDescriptors as a cross-check, plus Type3/Standard-14 policy.
   - Colour ops: count `rg/RG` and RGB/ICC-RGB colour spaces for a ⚠️.
   - OutputIntents: info only.
3. **pdfium object checks** (same file):
   - Walk page objects with your own matrix composition. Image DPI = px ÷ (‖matrix column‖/72); error < 150, warn < 250. **Do not use `get_metadata()` DPI.**
   - Image colour space via `get_metadata().colorspace`. The extra cost is acceptable because it's only a flag; or skip it when pikepdf already reported the colour space.
   - `get_font().is_embedded` for fonts actually used.
4. **pdfium render** page 1 (and 2) at ~100–150 dpi to PNG for the preview and bleed-strip sampling, clipped to the BleedBox coordinates that pikepdf computed.
5. Run steps 1–4 in a **Celery prefork worker** (or `concurrent.futures.ProcessPoolExecutor`), one document at a time per process. Set an upload cap (e.g. 250 MB) and a worker memory limit ~1 GB.

Expected cost for a normal flyer (Flyer.pdf, 6 MB): about **0.2 s and < 60 MB** for all checks plus one render. For a 139 MB image-heavy PDF: about **1 s and ~250 MB peak**.

Do not add PyMuPDF (AGPL) or Ghostscript for the demo: nothing in the demo cut needs them.
