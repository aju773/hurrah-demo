# Flyer demo prices — UAE public price anchors

Date checked: 2026-09-17. Source: raw HTML of official printer pages (curl + parse of rendered tables, option JSON, or Shopify `products.json`). Only numbers read on a page are listed. Search-snippet-only figures are marked *(unverified)*.

## TL;DR

- **Best anchor: Print Arabia.** It publishes full price grids with VAT included: offset "Standard Flyers" (2 business days, min 500–2,000 pcs) and digital "Express Flyers" (same day, from 100 pcs). Most of the ratios below come from these two grids.
- **A5 170gsm gloss single-sided, ex-VAT, Standard:** 1,000 ≈ AED 270–340 (median ~320). 5,000 ≈ AED 600–840. Short runs (100–500) come only from digital or same-day printers: 100 ≈ AED 110–145, 500 ≈ AED 260–360 ex-VAT.
- **Double-sided uplift:** +15–20% on offset, +17–37% on digital (A5). **Same-day:** +29% to +92% over Print Arabia's 2-day offset price (A5/A4, ≤1,000). **Express, 3 days instead of 6:** +12–22% (PrintOnline).
- **Size vs A5:** A6 ≈ 0.7×, DL ≈ 0.8×, A4 ≈ 1.7×, A3 ≈ 3.3×. **Paper vs 170gsm:** 130gsm ≈ 0.9×, 350gsm ≈ 2.0×.
- **Proposed seed (A5/170/1S/Standard, ex-VAT):** 100 → 95 · 250 → 150 · 500 → 235 · 1,000 → 320 · 2,500 → 460 · 5,000 → 680. Confidence: medium for ≥1,000, low–medium for ≤500.

## Sources and readability

| Printer | URL | Readable? | VAT |
|---|---|---|---|
| Print Arabia – Standard Flyers (offset) | https://www.printarabia.ae/flyer-printing-dubai | Yes, full grids (Non-Member prices) | Incl. ("(Incl.VAT)") |
| Print Arabia – Express Flyers (digital) | https://www.printarabia.ae/express-flyer-printing-dubai | Yes, full grids | Incl. |
| Print Arabia – Uncoated Flyers | https://www.printarabia.ae/uncoated-flyer-printing-dubai | Yes | Incl. |
| Print Arabia – Bulk Flyers | https://www.printarabia.ae/bulk-flyer-printing-dubai | Yes (10k+ only, not used) | Incl. |
| PrintOnline | https://www.printonline.ae/flyer-offer.html | Yes, via option JSON | Not stated on page |
| MaxPrint | https://www.maxprint.ae/collections/flyer (+ `/products.json`) | Yes | Not stated |
| 24by7 Print | https://24by7print.com/flyers | Yes (JS `PRICES` object + table) | Incl. ("All prices include VAT") |
| Printo – Value Flyers | https://printo.ae/product/value-flyers/ | Yes (100gsm matt 2S only) | Not stated |
| Color Spot | https://colorspotprints.com/product/flyer-printing-dubai/ | "From" prices only | Not stated |
| DubaiPrint | https://www.dubaiprint.com/marketing-materials/marketing/flyers | **JS-rendered configurator. No grid readable.** Page says "*All prices include 5% VAT" | Incl. (stated) |
| UAE Business Card | https://uaebusinesscard.com/flyer-printing | **No prices.** Quote via WhatsApp | – |
| Printezar | https://printezar.com/flyer-printing-uae | **No flyer prices readable** (paper tiers 115/135/170gsm listed; min 500) | – |
| Printstore | https://printstore.ae/flyer-printing-dubai/ | No table. Title says "1000 Flyers from 100 AED" *(unverified)* | – |

## Raw data points (AED)

1S = single-sided, 2S = double-sided. "Incl" = VAT included. Print Arabia grids start at 500 (A4/A3), 1,000 (A5), or 2,000 (A6). Blank means the size is not offered at that quantity.

### Print Arabia Standard (offset, gloss, 2 business days, VAT incl) — flyer-printing-dubai

| Paper | Sides | Qty | A6 | A5 | A4 | A3 |
|---|---|---|---|---|---|---|
| 130gsm | 1S | 500 | | | 320 | 466 |
| 130gsm | 1S | 1,000 | | 320 | 394 | 614 |
| 130gsm | 1S | 2,500 | 340 | 432 | 616 | 1,056 |
| 130gsm | 1S | 5,000 | 432 | 616 | 984 | 1,794 |
| 130gsm | 2S | 500 | | | 350 | 512 |
| 130gsm | 2S | 1,000 | | 350 | 440 | 688 |
| 130gsm | 2S | 2,500 | 374 | 484 | 706 | 1,222 |
| 130gsm | 2S | 5,000 | 484 | 706 | 1,150 | 2,108 |
| 170gsm | 1S | 500 | | | 342 | 535 |
| 170gsm | 1S | 1,000 | | 354 | 437 | 732 |
| 170gsm | 1S | 2,000 | 354 | 448 | 621 | 1,132 |
| 170gsm | 1S | 2,500 | 371 | 494 | 715 | 1,332 |
| 170gsm | 1S | 5,000 | 441 | 727 | 1,180 | 2,328 |
| 170gsm | 2S | 500 | | | 413 | 605 |
| 170gsm | 2S | 1,000 | | 413 | 519 | 812 |
| 170gsm | 2S | 2,500 | 441 | 571 | 833 | 1,442 |
| 170gsm | 2S | 5,000 | 571 | 833 | 1,357 | 2,488 |

### Print Arabia Express (digital, same day if proof approved by 11am, Dubai only, VAT incl) — express-flyer-printing-dubai

| Paper | Sides | Qty | A6 | DL | A5 | A4 | A3 |
|---|---|---|---|---|---|---|---|
| 170gsm | 1S | 100 | 100 | 110 | 115 | 155 | 305 |
| 170gsm | 1S | 500 | 175 | 210 | 275 | 455 | 1,210 |
| 170gsm | 1S | 1,000 | 275 | 340 | 455 | 840 | 2,340 |
| 170gsm | 2S | 100 | 110 | 125 | 135 | 195 | 410 |
| 170gsm | 2S | 500 | 220 | 265 | 360 | 625 | 1,710 |
| 170gsm | 2S | 1,000 | 360 | 450 | 625 | 1,170 | 3,340 |

Also on that page: A5 170gsm 1S 200 = 155 and 300 = 195. A5 2S 200 = 195 and 300 = 245.

### Print Arabia Uncoated 120gsm wood-free (1 business day, VAT incl)

A5 1S: 100 = 110 · 500 = 245 · 1,000 = 405. A5 2S: 100 = 130 · 500 = 325 · 1,000 = 565. A4 1S: 100 = 150 · 500 = 405 · 1,000 = 730. (The page title says "1000 A5 flyers for 435 Dhs", which does not match the 405 in the grid.)

### 24by7 Print (170gsm art gloss, same day if ordered before 2pm (Dubai), otherwise next working day, VAT incl, **no turnaround surcharge in price logic**)

| Qty | A5 1S | A5 2S | A4 1S | A4 2S |
|---|---|---|---|---|
| 100 | 150 | 200 | 200 | 250 |
| 200 | 220 | 300 | 350 | 400 |
| 300 | 260 | 400 | 450 | 500 |
| 400 | 300 | 500 | 550 | 600 |
| 500 | 375 | 600 | 600 | 700 |

Folding costs +75.

### PrintOnline "Take or Leave" offset (2S only, 6 working days standard, VAT not stated, min 1,000)

| Paper | Qty | DL | A6 | A5 | A4 | A3 |
|---|---|---|---|---|---|---|
| 170gsm | 1,000 | 195 | 130 | 180 | 385 | 750 |
| 170gsm | 2,000 | 240 | 175 | 325 | 535 | 950 |
| 170gsm | 5,000 | 425 | 280 | 595 | 775 | 1,750 |
| 350gsm | 1,000 | 350 | 275 | 360 | 840 | 1,100 |
| 350gsm | 2,000 | 690 | 580 | 680 | 1,300 | 2,075 |

A5 170gsm 10,000 = 1,080. **"Urgent: 3 Working Days" surcharge (AED, 170gsm):** DL 31/36/52 · A6 23/27/40 · A5 40/46/78 (10k: 131) · A4 78/80/131 · A3 131/160/240, at 1k/2k/5k. Same-day delivery by special driver: +50 (Dubai, Sharjah, Ajman) or +150 (other emirates). A5 1,000 at 180 costs less than DL at 195, so it looks like a promo price.

### MaxPrint (2S only, 2–4 business days, VAT not stated; sale price shown, "compare at" price omitted)

| Paper | Qty | A6 | DL | A5 | A4 | A3 |
|---|---|---|---|---|---|---|
| 135gsm gloss | 500 | 90 | | 120 | 210 | 420 |
| 135gsm gloss | 1,000 | 115 | 115 | 155 | 285 | 570 |
| 135gsm gloss | 2,000 | 150 | 160 | 205 | 350 | 700 |
| 135gsm gloss | 5,000 | 235 | 270 | 345 | 600 | 1,200 |
| 200gsm gloss | 500 | 95 | | 125 | 230 | 455 |
| 200gsm gloss | 1,000 | 120 | 145 | 170 | 320 | 640 |
| 200gsm gloss | 5,000 | 260 | 395 | 395 | 735 | 1,465 |

Bundles of A5 170gsm gloss (sides not stated): 1,000 = 270 · 2,000 = 540 · 5,000 = 840 · 10,000 = 1,360.

### Others

- **Printo Value Flyers** (100gsm matt 2S, 3 business days): A6/A5/A4 at 2,500 = 425/475/690 · 5,000 = 500/610/1,050 · 7,500 = 600/800/1,450 · 10,000 = 675/900/1,600.
- **Color Spot:** "1,000 Flyers from AED 130" for A5 at 130–170gsm, 1S or 2S, 2–3 days. A6 from 90 per 1,000. VAT not stated. These are marketing "from" prices, not a grid.
- *(unverified, snippet)* Printstore "1000 Flyers from 100 AED". DLX Print "From AED 65".

## Derived ratios (ranges seen)

**Double-sided uplift (2S/1S − 1)**
- Print Arabia offset 170gsm: A5 +15–17% · A4 +15–21% · A3 +7–13% · A6 +17–29%
- Print Arabia offset 130gsm: +9–18%
- Print Arabia digital same-day 170gsm: A5 +17% (100), +31% (500), +37% (1,000). All sizes: +10–43%
- 24by7: A5 +33–67% · A4 +9–25%
- Print Arabia uncoated A5: +18–39%

**Size vs A5 (same printer, paper, sides, and qty)**
- A6: PA offset 0.61–0.79 · PA digital 0.60–0.87 · MaxPrint 0.68–0.75 · PrintOnline 0.47–0.72
- DL: PA digital 0.75–0.96 · MaxPrint 0.74–0.78 · PrintOnline 0.71–1.08
- A4: PA offset 1.23–1.62 · PA digital 1.35–1.85 · MaxPrint 1.71–1.84 · 24by7 1.33–1.83 · PrintOnline 1.30–2.14
- A3: PA offset 2.07–3.20 · PA digital 2.65–5.14 · MaxPrint 3.41–3.68 · PrintOnline 2.92–4.17

**Paper weight**
- 130gsm vs 170gsm (PA offset, 1S): A5 0.85–0.90 · A4 0.83–0.94 · A3 0.77–0.87
- 135gsm vs 200gsm (MaxPrint): A5 0.87–0.96
- 350gsm vs 170gsm (PrintOnline): A5 2.00–2.09 · all sizes 1.47–3.31
- 300gsm: no public price found

**Turnaround**
- Express, 3 working days vs 6 (PrintOnline): +12–22% (A5 +12–22%)
- Same-day digital vs 2-day offset (Print Arabia, 170gsm): A5 1,000 +29% (1S) / +51% (2S) · A4 500 +33% (1S) / +51% (2S) · A4 1,000 +92% / +125% · A3 +126–220%
- 24by7: same-day costs the same as next-day (no surcharge)

**Quantity curve (total / total at 500)**
- PA digital A5 1S: 100 = 0.42 · 1,000 = 1.65
- 24by7 A5 1S: 100 = 0.40 · 200 = 0.59 · 300 = 0.69
- MaxPrint A5 135gsm: 1,000 = 1.29 · 2,000 = 1.71 · 5,000 = 2.88
- PA offset A4 170gsm 1S: 1,000 = 1.28 · 2,500 = 2.09 · 5,000 = 3.45
- PA offset A5 170gsm 1S, vs 1,000: 2,500 = 1.40 · 5,000 = 2.05

## Proposed demo seed

**Base: A5 · 170gsm gloss · single-sided · Standard · ex-VAT totals (AED)**

| Qty | Total | Unit | vs 500 | Justification |
|---|---|---|---|---|
| 100 | 95 | 0.95 | 0.40 | PA same-day 110 ex-VAT and 24by7 143 ex-VAT, both same-day. Standard set below both. Ratio matches the 0.40–0.42 seen |
| 250 | 150 | 0.60 | 0.64 | Between the 24by7 200→300 curve (0.59–0.69) and PA digital 200/300 (148/186 ex-VAT, same-day) |
| 500 | 235 | 0.47 | 1.00 | PA digital 262 ex-VAT (same-day) minus a standard discount. Above MaxPrint 135gsm 2S (120) |
| 1,000 | 320 | 0.32 | 1.36 | PA offset 337 ex-VAT and MaxPrint 170gsm bundle 270. Inside the 1.28–1.65 range |
| 2,500 | 460 | 0.18 | 1.96 | PA offset 470 ex-VAT. Ratio to 1,000 = 1.44 (PA 1.40) |
| 5,000 | 680 | 0.14 | 2.89 | PA offset 692 ex-VAT and MaxPrint 840. Inside the 2.88–3.45 range |

**Uplifts** (applied to the base total)

| Modifier | Proposed | Evidence |
|---|---|---|
| Double-sided | **+20%** | Offset +15–21% (170gsm A5/A4), digital A5 +17–37%. +20% sits at the offset top and the digital low end |
| Express (next-day / half standard time) | **+20%** | PrintOnline 3-day vs 6-day +12–22%. Next-day is faster, so the top of that range |
| Same-day | **+50%** | PA same-day vs 2-day: A5 +29–51%, A4 +33–92%. 24by7 charges 0%. Use +50%, and limit same-day to ≤1,000 qty in the demo (digital only) |

**Size multipliers (vs A5)**

| A6 | DL | A5 | A4 | A3 |
|---|---|---|---|---|
| 0.70 | 0.80 | 1.00 | 1.70 | 3.30 |

These values sit near the middle of each cross-printer range (A6 0.47–0.87, DL 0.71–1.08, A4 1.23–2.14, A3 2.07–5.14).

**Paper multipliers (vs 170gsm gloss)**

| 130gsm | 170gsm | 300gsm | 350gsm |
|---|---|---|---|
| 0.90 | 1.00 | 1.80 *(interpolated, no public data)* | 2.00 |

- 130gsm: PA A5 0.85–0.90
- 350gsm: PrintOnline A5 2.00–2.09

**Confidence**
- **Medium** for 1,000–5,000 and the offset double-sided uplift, both anchored on complete VAT-incl grids.
- **Low–medium** for 100–500. The only public short-run prices are same-day digital, so the Standard price is an estimate.
- **Low** for the Express %, since there is one source and its baseline is 6 days, not next-day.
- **Low** for 300/350gsm and A3. A3 is spread wide (2.1–5.1×). 300gsm is interpolated.
- VAT: Print Arabia, 24by7, and DubaiPrint include 5% VAT. PrintOnline, MaxPrint, and Printo don't say. Their ex-VAT figures above take the page number at face value.
