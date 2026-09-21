# Demo files and scripted runs

## Ready-made demo files

Write them to any folder (the browser tests write them to `frontend/e2e/fixtures/generated/`):

```bash
cd backend && venv/bin/python manage.py write_fixture_pdfs --out ~/demo-files
```

| File | Story | What the customer sees |
| --- | --- | --- |
| `f2-omar-a5-clean.pdf` | **Print-ready.** Omar's 2-page A5 flyer with 3mm bleed. | On the Artwork page the options fill in by themselves (A5, double-sided), "Ready to print", no findings. The Order goes straight to production. |
| `f1-layla-a4-no-bleed.pdf` | **Needs fixing.** Layla's 2-page A4 flyer, RGB, no bleed, a ~200 ppi logo. | Size and sides dialogs if the options were chosen first, Fit/Fill, Warnings (bleed, resolution) and a Note (colour), enlarged view. The Order waits for a staff check. |
| `f3-password-protected.pdf` | **Protected.** A password-protected A5 file. | Refused: "We couldn't open this file…". |
| `f4-damaged-repairable.pdf` | **Damaged.** F2 with a broken cross-reference table. | Accepted after repair, with a "Your file was damaged; we repaired it" Warning. |
| `f5-five-pages-flyer-on-3-and-4.pdf` | **Page picker.** A4 cover, A6 divider, an A5 Front and Back with bleed (pages 3 and 4), A4 closing page. | The Page picker opens; choose page 3 as Front and page 4 as Back, and the file is print-ready. |

A JPG (or anything that is not a PDF) is refused with "This file isn't a PDF…" and the page keeps working.

## Before a demo

```bash
cd backend && venv/bin/python manage.py reset_demo --fix-clock
```

Clears Orders, Design requests and uploads, restarts numbering at HUR-10001 and pins the demo clock to a Tuesday 09:30 Dubai, so Same-day always works. Run the backend with `COMMERCE_ENABLED=false` (the default) so no price, total or payment shows.

The journey is three pages: the **Options page** (`/flyers`), the **Artwork page** (`/flyers/artwork`, upload, Findings, preview, Rotate, Swap, Summary and "Edit options") and approval (`/flyers/approve`). A placed Order clears the customer's draft, so the next visit to `/flyers` starts at the Options page; the Artwork and approval addresses send a visitor with no Configuration back there.

## Scripted runs

`e2e/journey.spec.js` plays the two personas above from a clean reset, Options page then Artwork page then approval, in English and Arabic, at desktop width and at 390px, each ending on the Order confirmation page after a staff move (Pass for Layla's Order, Out for delivery for Omar's, which needs no Pass). It also plays one keyboard-only run (focus lands on each page's heading) and the off-script files.

`e2e/journey-pages.spec.js` plays the page-by-page behaviour, in English and Arabic at desktop width and at 390px: the Options page holds only Options and the Summary (no upload, no money); "Start ordering", browser Back and Forward, reload and cold addresses (redirects to the Options or Artwork page); Rotate and Swap changing the preview and Findings while the uploaded file stays untouched; "Edit options" (a Size change keeps and re-checks the file, single-sided drops the Back with a notice); and a new journey starting at the Options page after an Order.

`e2e/journey-extras.spec.js` plays the three extras, in English and Arabic at desktop width, each from the Options page to the Order confirmation page: the Page picker on F5 (pages 3 and 4 as Front and Back), an A5 Artwork template downloaded and uploaded unchanged ("Ready to print"), and the first-visit hints (one per page, dismissed with Escape, none after a reload). Hints are off in every other run; this one turns them on. Every step asserts there is no money text and no console error.

```bash
cd frontend && npm run test:e2e
```

The runs start their own throwaway backends and frontends (ports 8100/3100 for the priced specs, 8101/3101 for the money-free runs) and never touch the dev database.
