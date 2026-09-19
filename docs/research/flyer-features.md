# Flyer Feature Research — Hurrah (UAE web-to-print)

- **Date checked:** 2026-09-17 (all prices, licences and product options below were read on this date unless noted)
- **Scope:** Flyers first, built so the same parts work for ~150 later products
- **Method:** Official product/help pages of 15+ printers (8 in the UAE), standards bodies (ISO, Adobe's copy of ISO 32000-1, ECI, GWG), official library repos, licence files and PyPI data, vendor pricing pages, and UAE government pages.
- **Limits:** Several UAE government sites (dubaidet.gov.ae, consumerrights.gov.ae, portal.dm.gov.ae) returned HTTP 403/503 to our fetcher. Where a rule could only be confirmed from search snippets or secondary sites, it is marked **secondary** or **unverified**. Customer segment profiles (section 2) are **analysis**: we found no public survey data on UAE flyer buyers, so treat quantities and deadlines as guesses to check with the client.

---

## 1. TL;DR

1. **The draft covers the "designer uploads a print-ready PDF" customer well, but not the larger UAE market.** Every UAE printer we checked sells design help, and most sell it prominently: Print Arabia has 3 design tiers, Printezar designs over WhatsApp, and Color Spot offers free design support ([Print Arabia](https://www.printarabia.ae/), [Printezar](https://printezar.com/flyer-printing-uae), [Color Spot](https://colorspotprints.com/product/flyer-printing-dubai/)). A "Need a design?" path should be in the demo, even if it is only a request form or WhatsApp handoff.
2. **Same-day Dubai delivery is normal in this market, not a premium extra.** Print Arabia promises same-day delivery for proofs approved by 11am, delivered 3–8pm ([Print Arabia Express](https://www.printarabia.ae/express-flyer-printing-dubai)). 24by7 Print promises 2–3 hours in Dubai and next day in Abu Dhabi for orders before 2pm ([24by7print](https://24by7print.com/)). "Normal/express" should become **standard / express / same-day (Dubai), each with a cut-off time**.
3. **Proof approval belongs in the demo, not Phase 2.** Every UAE site that describes its process makes the customer approve a digital proof before printing ([Print Arabia](https://www.printarabia.ae/flyer-printing-dubai), [Color Spot](https://colorspotprints.com/product/flyer-printing-dubai/)). Hurrah's "confirm" step *is* this proof, so present it that way.
4. **Two kinds of file check are the norm: a free automatic one and a cheap paid expert one.** Examples: Pixartprinting "PRO File Check & Fix" costs $5 ([Pixart](https://support.pixartprinting.com/hc/en-us/articles/18366648721682-PRO-File-Check-Fix)), Helloprint Premium Artwork Check costs £2.99–£19.99 (secondary: search snippet of [Helloprint](https://www.helloprint.com/en-us/artwork-check)), and Print.com has Standard (automatic) vs Extra Care (manual) ([Print.com](https://www.print.com/en/flyers-leaflets/)). Move "expert check" from Phase 3 to Launch.
5. **The 300 DPI hard limit is too strict.** Industry preflight guidance puts the offset minimum at about 150 ppi (secondary: [prepressure.com](https://www.prepressure.com/pdf/basics/preflight)). Use **error below 150 effective ppi, warning below 250**, so customers are not rejected for files that print fine.
6. **pdf.js cannot read TrimBox or BleedBox.** Its `page.view` is only the MediaBox/CropBox overlap ([pdf.js source](https://github.com/mozilla/pdf.js/blob/master/src/core/document.js)). The backend has to read the boxes and send them to the preview.
7. **Use pypdfium2 (BSD-3-Clause/Apache-2.0) plus pikepdf (MPL-2.0) for preflight, not PyMuPDF (AGPL-3.0).** pypdfium2 reads page boxes, the effective DPI of each placed image, and whether fonts are embedded ([pypdfium2 source](https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/pageobjects.py)). Ghostscript is AGPL too, so keep it as a separate unmodified command-line step and have a lawyer confirm that.
8. **The online designer should move after launch.** Polotno costs $249–$899/month and its Grass Roots tier needs manual approval ([Polotno pricing](https://polotno.com/sdk/pricing)). We could not confirm its Arabic/RTL support. IMG.LY CE.SDK documents full Arabic/bidi support ([CE.SDK](https://img.ly/docs/cesdk/js/text/language-support-a0f010/)) but only sells on custom quotes. For launch, use downloadable templates plus a "made in Canva" guide, which is what PrintOnline.ae does ([PrintOnline](https://www.printonline.ae/flyer-offer.html)).
9. **UAE compliance affects what buyers upload.** Real-estate ads need a Dubai Land Department permit (AED 1,000; [DLD](https://dubailand.gov.ae/en/eservices/real-estate-ad-permit/)). Distribution sellers say Dubai flyers need economic-department approval, Arabic text and a Consumer Rights logo (secondary: [Leads Dubai](https://www.leadsdubai.com/flyer-distribution-company-dubai/)). Add an optional compliance checklist at launch. Hurrah should not act as the permit authority.
10. **Cut or delay several draft items:** RGB→CMYK auto-fix as a customer feature (do it in prepress instead), variable data printing, spot UV and rounded corners on flyers. **Bring forward:** folds (for menus), lamination, reorder and templates.

---

## 2. User segments

These profiles are **analysis**, based on which flyer products printers target at each industry: 4over4 has restaurant, food-truck, grand-opening and car-wash flyers ([4over4](https://www.4over4.com/product/flyers)); Vistaprint has menus ([menus](https://www.vistaprint.com/marketing-materials/menus)); plus UAE regulator pages. Quantities and deadlines are estimates to check with the client.

| Segment | Flyer use | Skill | Typical qty (est.) | Deadline | Top need | Features that serve them |
|---|---|---|---|---|---|---|
| **S1 Restaurants / cafés / cloud kitchens** | Delivery menus, takeaway leaflets, opening promos. Bi/tri-fold menus are a separate product at Vistaprint ([menus](https://www.vistaprint.com/marketing-materials/menus)) | Mostly no designer; menu text changes often | 1,000–5,000 for delivery drops; 100–250 for dine-in menus | Medium; urgent at opening | Price per piece, Arabic+English menu, durability | A5/DL, 130–170gsm; folds (half/tri); matt lamination; reorder with edits; design service; bilingual templates |
| **S2 Real estate agents / brokers** | Listing and project-launch flyers, open-house handouts | Agency brand templates; agents without design skills | 100–500 per listing | High; listings change fast | Speed, premium feel, **permit compliance** | Express/same-day; 250–350gsm; gloss/velvet lamination; QR code; DLD permit-number field ([DLD ad permit](https://dubailand.gov.ae/en/eservices/real-estate-ad-permit/)) |
| **S3 Retail promos / supermarkets** | Offer and sale flyers, door-to-door drops | In-house or agency | 5,000–20,000+ (Print Arabia's standard flyer goes to 20,000: [link](https://www.printarabia.ae/flyer-printing-dubai)) | Tied to sale dates | Lowest unit price at volume | Tiers above 5,000; 115–130gsm; quote request; promotion-permit reminder |
| **S4 Events / nightlife / concerts** | Handbills, club flyers | Freelance designer | 250–2,500 | **Very high**, often a few days before the event | Speed, bold finish | Same-day/express; 350gsm card; A6/square; gloss; clear cut-off times |
| **S5 Schools / education / training centres** | Enrolment, open-day and course flyers | Admin staff, templates | 500–2,000 at term start | Seasonal peaks | Clear bilingual text, price | Templates; Arabic/English; uncoated (writable); reorder each term |
| **S6 Clinics / salons / spas / gyms** | Service menus, offers, rack cards | No designer | 250–1,000 | Low–medium | Premium look; health-ad rules for clinics | 350gsm, matt/velvet; rack card/DL; design service; DHA note for medical ads (secondary: [CMS guide](https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/united-arab-emirates)) |
| **S7 SMEs with no designer** | General promo, grand opening | None; may upload JPG/PNG or Word | 100–1,000 | Medium | Being told "is this OK?"; design help | Accept JPG/PNG with clear warnings; plain-language preflight; $/AED design service (Vistaprint charges $10 for a flyer design: [Vistaprint](https://www.vistaprint.com/experts/services/details/flyers?mpvId=flyers&locale=en-US)); templates; WhatsApp support |
| **S8 Agencies / print resellers** | Client work, often many jobs | Pro, print-ready PDF/X | Any; repeat | High | Predictable specs, file acceptance, trade price, white-label delivery | Strict preflight report; clear box/bleed specs; reorder; saved addresses; blind shipping; account pricing |
| **S9 Corporates with brand guidelines** | Product and event collateral | Agency/in-house | 500–5,000 | Medium | Colour consistency, invoices, approvals | Stock/finish consistency; PDF proof; VAT invoice; PO/credit terms; multi-user approval (later) |
| **S10 Community / religious / political / charity events** | Ramadan/Eid events, iftar, community notices | Volunteers | 100–1,000 | High near dates | Cheapest option, Arabic | Templates (Ramadan/Eid); A5/A6 130gsm; digital short runs from 100 |

**Key insight:** only S8 (and some of S4/S9) match the draft's "upload a print-ready PDF" flow. S1, S2, S6, S7 and S10 need design help, templates and forgiving checks.

---

## 3. Competitor option matrix

🇦🇪 = UAE site. "—" = not stated on the page we read.

| Site | Sizes | Papers | Finishes | Folds / shapes | Qty | Turnaround | Design help | File check / proof |
|---|---|---|---|---|---|---|---|---|
| 🇦🇪 **Print Arabia** standard ([link](https://www.printarabia.ae/flyer-printing-dubai)) | A6, A5, A4, A3, **DL 100×210** | 130, 170gsm gloss | Perforation, hot foil, score/fold, gloss/matt/velvet lamination (+1 day each) | Folding offered | 500–20,000 | 2 business days; proof approval by 1pm; Dubai same-day delivery 3–8pm | Pro Design, Artworking, One-to-One Design Desk ([home](https://www.printarabia.ae/)) | Free artwork check + free digital proof ([home](https://www.printarabia.ae/)) |
| 🇦🇪 **Print Arabia** express ([link](https://www.printarabia.ae/express-flyer-printing-dubai)) | A6, DL, A5, A4, A3 | 170 gloss; 200 gloss; 200 matt | — | — | 100–1,500 | Same business day if approved by **11am**; delivered 3–8pm Dubai | As above | Proof approval required |
| 🇦🇪 **Printo** ([link](https://printo.ae/product/express-flyer-printing-dubai/)) | A6, A5, A4, custom | 170 gloss; 200 gloss/matt | Gloss/matt | — | 100, 200 … 1,000, 1,500 | Same-day Dubai; standard 3 business days | "Collaborate with professional designers" | — |
| 🇦🇪 **PrintOnline.ae** 1000-flyer offer ([link](https://www.printonline.ae/flyer-offer.html)) | DL 99×210, A6, A5, A4, A3, B6, B5, B4 | 170gsm art; 350gsm card | — | — | 1,000 / 2,000 / 5,000 (one design per qty) | Standard 6 working days; express 3; +1–2 days shipping | Paid design; free Canva templates | Print-ready required: CMYK, 300 DPI, 3mm bleed, 5mm safe |
| 🇦🇪 **Dubaiprint.com** ([link](https://www.dubaiprint.com/flyers)) | A6, DL, A5, A4 | 100–280gsm; standard/premium/luxury (Fedrigoni, Conqueror…) | Matt or gloss | — | From 20 | "Express delivery" (no time) | — | Image upload |
| 🇦🇪 **Perklets** ([link](https://perkletz.com/flyers/)) | A4, A5, A6, DL 99×210, custom | 130–170 std; 250–350 premium; gloss/matt/uncoated | Spot UV, foil, emboss/deboss, die-cut | A3→A4, A4→DL, roll, Z-fold | Min 100; 10,000+ | 2–3 days std; 4–8 days premium | — | Specs: CMYK, 300 DPI, 3mm bleed |
| 🇦🇪 **Color Spot** ([link](https://colorspotprints.com/product/flyer-printing-dubai/)) | A5, A6, DL/custom, A4, A3 | 130–170; 170–250 | Gloss/matt; perforation, hot foil, score/fold, velvet lamination | Bi-fold, tri-fold | Min 500 (1,000 DL/folded) | 2–3 days; folded 3–5 | **Free** design support | Free digital proof; file check; 3mm bleed, 5mm safe |
| 🇦🇪 **Printezar** ([link](https://printezar.com/flyer-printing-uae)) | A6, A5, A4 | 115, 135, 170gsm gloss | — | — | Min 500; 1k/2k/5k | ~1 week after design approval | Design via WhatsApp | — |
| 🇦🇪 **24by7 Print** ([link](https://24by7print.com/)) | A4, A5, DL | — | — | — | — | Dubai 2–3 h, 24/7; Abu Dhabi next day if ordered by 2pm; delivery AED 10.50 / express AED 20 + VAT | — | PDF/JPG/PNG to 200MB; "reads page count automatically"; COD |
| 🇦🇪 **UAE Business Card** ([link](https://uaebusinesscard.com/flyer-printing)) | A6, A5, A4, DL | 130–170; 250–300 | Gloss/matt/silk | — | Bulk tiers | "~2h free proof"; same/next day | — | Free proof |
| **Vistaprint** ([link](https://www.vistaprint.com/marketing-materials/flyers)) | 11 sizes (e.g. 2.5×4", 3.75×8.25", 4×6") | Gloss, matt, uncoated, recycled; 6 thicknesses | — | — | 25–20,000 | Std ~6 business days; rush 2 | Industry templates; $10 flyer design, 24h, 3 revisions ([link](https://www.vistaprint.com/experts/services/details/flyers?mpvId=flyers&locale=en-US)) | Many upload formats; studio with bleed/safety lines ([help](https://www.vistaprint.com/customer-care/help-center/360059872652)); samples for purchase |
| **UPrinting** ([link](https://www.uprinting.com/flyer-printing.html)) | 8.5×11, 5.5×8.5, 5×7, 4×6, 4.25×5.5, custom | 70lb uncoated … 17pt card | Gloss, matt, high-gloss UV, silk/velvet lamination, foil, spot UV (incl. raised) | Rounded corners, circle, half-circle, leaf, oval | — | "1 business day" on some | Online designer; DesignCrowd | **Free 30-point file check**, free PDF proof; hard-copy proof $25 ([leaflets](https://www.uprinting.com/leaflet-printing.html)) |
| **4over4** ([category](https://www.4over4.com/printing/category/flyer-printing), [flyers](https://www.4over4.com/product/flyers)) | 9 sizes, 4.25×5.5 to 11×25.5" | 7 stocks on flyers; 60+ papers overall | High-gloss UV | Staggered-cut flyers | From $39.54/100 (search snippet) | Same-day ship on some (title) | Industry flyer pages | — |
| **PrintingCenterUSA** ([link](https://www.printingcenterusa.com/printing/flyer-printing)) | 8.5×11, 5.5×8.5 + more | Gloss/matt | — | Half, tri, Z, double parallel, right-angle folds | From 50 | 3–4 days after proof approval | Downloadable templates; "Find a Designer" | **Free file review**; proof approval |
| **Pixartprinting** ([link](https://www.pixartprinting.com/digital-litho-printing/printing-leaflets-flyers/)) | 2.5×4" to 11×17" incl. squares | 70lb uncoated; 100/170lb matt/gloss; 14pt | Lamination | — | From 25 | — | Online editor, templates | **PRO File Check & Fix $5**, done after payment + upload ([link](https://support.pixartprinting.com/hc/en-us/articles/18366648721682-PRO-File-Check-Fix)) |
| **Helloprint** (secondary: search snippets) | A5 148×210 etc. | 135, 170 (recommended), 250, up to 400gsm | — | — | — | Next-day delivery on flyers ([delivery](https://www.helloprint.com/en-us/delivery-services)) | Designers adjust/create artwork | Basic (free) vs **Premium £2.99–£19.99** ([link](https://www.helloprint.com/en-us/artwork-check)) |
| **Print.com** ([link](https://www.print.com/en/flyers-leaflets/)) | 38 flyer sizes; 23 leaflet formats | 68 materials incl. waterproof, metallic | Creasing, perforation, drilling, rounded corners, spot finishes | 10 fold methods | Digital from 10; offset from 500 | 3 service tiers | None | Standard (automatic) vs Extra Care (manual) |
| **MOO** ([link](https://www.moo.com/uk/flyers)) | A6, square 120×120, DL 99×210, A5, A4 | 160 recycled uncoated; 250 gloss / 225 matt; 300 pearlescent | — | — | Min 50 | ~2 days | Templates; **Printfinity** (up to 50 back designs per pack, [link](https://www.moo.com/us/about/printfinity)) | Free sample packs |
| **Printed.com** ([link](https://www.printed.com/leaflets-and-flyers/flat-leaflets-and-flyers)) | — (JS page, not readable) | — | — | — | — | Next-day delivery (search snippet) | Free templates; Canva support (nav) | Free sample packs (nav) |
| **Canva Print** ([help](https://www.canva.com/help/where-canva-prints-ships/)) | A4/A5/US letter (search snippet) | Standard, premium, recycled matt | — | — | Bulk discounts | 5–8 business days incl. 1–2 production | Canva editor | — ; **UAE not in its shipping list** (search snippet, unverified) |

**Adjacent products flyer buyers expect** (to reuse the flyer setup later):
- **Door hangers:** 3.5×8.5" and 4.5×11"; 30mm hole with slit; optional tear-off at 2"; min 50 ([Vistaprint](https://www.vistaprint.com/marketing-materials/door-hangers)). Print Arabia also sells them ([home](https://www.printarabia.ae/)).
- **Rack cards:** 3.74×8.27" (≈ DL); 13 stocks; rounded corners, foil, perforated rip-card variants ([Vistaprint](https://www.vistaprint.com/marketing-materials/rack-cards)).
- **Menus:** flat, bi-fold, tri-fold, synthetic (washable) ([Vistaprint](https://www.vistaprint.com/marketing-materials/menus)).
- **Leaflets / folded pamphlets:** half-, tri-, Z-, gate- and accordion folds ([UPrinting](https://www.uprinting.com/leaflet-printing.html)).

**Takeaways for the demo option set**
- UAE flyer papers cluster around **130/170gsm gloss** (offset) and **170/200gsm gloss/matt** (digital express), with **350gsm** as the premium card. 250gsm is less common in the UAE. Uncoated is rare on UAE sites except premium mills.
- UAE quantities split into **digital 100–1,500** and **offset 500–20,000**. The draft's 100–5,000 tiers fit, but add "custom quote above 5,000".
- **DL is 99×210 at MOO and PrintOnline but 100×210 at Print Arabia.** Size detection needs a tolerance of about ±1mm.

---

## 4. UX patterns worth copying

| # | Pattern | Who does it | Recommendation for Hurrah |
|---|---|---|---|
| U1 | **Options first, then price, then upload.** File check can run after payment. | Print Arabia, Vistaprint, UPrinting. Pixart reviews PRO checks only after payment and upload ([Pixart](https://support.pixartprinting.com/hc/en-us/articles/18366648721682-PRO-File-Check-Fix)) | Let the customer choose either order: options → upload, or upload → auto-fill options from the detected size and page count. Upload-first suits agencies (S8); options-first suits SMEs. Allow "upload later" after checkout for express orders with a cut-off. |
| U2 | **Proof approval with a production cut-off.** | Print Arabia: approve by 1pm (standard) or 11am (same day) ([std](https://www.printarabia.ae/flyer-printing-dubai), [express](https://www.printarabia.ae/express-flyer-printing-dubai)) | Show a live "approve before HH:MM for delivery on DATE" countdown on the confirm screen. |
| U3 | **Free automatic check + paid human check.** | UPrinting free 30-point check + free PDF proof, $25 hard proof ([link](https://www.uprinting.com/leaflet-printing.html)); Pixart $5 ([link](https://support.pixartprinting.com/hc/en-us/articles/18366648721682-PRO-File-Check-Fix)); Helloprint £2.99–£19.99 (secondary); Print.com Standard vs Extra Care ([link](https://www.print.com/en/flyers-leaflets/)) | Demo: free automatic preflight report. Launch: optional "Expert check" (roughly AED 15–25, **price to confirm with client**) with a same-day SLA. |
| U4 | **On-canvas trim / bleed / safety lines, plus a way to fix full-bleed.** | Vistaprint shows dashed trim and safety lines. Uploaded images snap to the print edge at the safety margin, then the user stretches them manually ([bleed help](https://www.vistaprint.com/customer-care/help-center/360051218651/), [trim vs bleed](https://www.vistaprint.com/customer-care/help-center/360059872652)) | When the size doesn't match, give explicit choices and never silently rescale: **(a)** switch order to the detected size, **(b)** fit inside trim (white border warning), **(c)** fill to bleed (crop preview), **(d)** upload a new file. |
| U5 | **Price table by quantity with per-piece price.** | Print Arabia shows total + per-copy, "VAT included" ([link](https://www.printarabia.ae/flyer-printing-dubai)); Printo lists 100–1,500 steps ([link](https://printo.ae/product/express-flyer-printing-dubai/)); Dubaiprint says "includes 5% VAT" ([link](https://www.dubaiprint.com/flyers)) | Grid of quantity × turnaround, AED **including VAT** with the ex-VAT figure underneath, and per-piece price shown. |
| U6 | **Cheap, fast design service.** | Vistaprint $10 flyer design, 24h, 3 revisions ([link](https://www.vistaprint.com/experts/services/details/flyers?mpvId=flyers&locale=en-US)); Print Arabia 3 tiers; Printezar via WhatsApp; Color Spot free | Demo: "Don't have a design?" → short brief form + WhatsApp. Launch: fixed-price packages (e.g. single-sided / double-sided / bilingual). |
| U7 | **Templates by industry and fold.** | Vistaprint industry templates ([link](https://www.vistaprint.com/marketing-materials/flyers/templates)); PrintingCenterUSA downloadable templates per fold ([link](https://www.printingcenterusa.com/templates/flyer)); PrintOnline links to Canva ([link](https://www.printonline.ae/flyer-offer.html)) | Launch: downloadable PDF/AI/IDML/Canva-size templates per size/fold with bleed guides (cheap to make, serves S5/S7/S10). |
| U8 | **Reorder from account.** | Vistaprint "My Projects" allows edits to qty/finish but usually not size ([help](https://www.vistaprint.com/customer-care/help-center/360050499971)) | Launch: one-click reorder that copies the file and options; changing size forces a new preflight. |
| U9 | **Samples.** | MOO free sample packs ([link](https://www.moo.com/uk/flyers)); Vistaprint paid samples; Printed.com free sample packs | Later: a paper swatch pack for corporates/agencies (S8/S9). |
| U10 | **Different designs in one order.** | MOO Printfinity up to 50 backs ([link](https://www.moo.com/us/about/printfinity)); PrintOnline says one design per quantity ([link](https://www.printonline.ae/flyer-offer.html)) | Later: "multiple designs, split quantity" (useful for S2 listings and S8). Simpler and more useful than full variable data. |
| U11 | **Delivery and payment built for the UAE.** | 24by7: 2–3h Dubai, Abu Dhabi next day by 2pm, AED 10.50/20 fees, **cash on delivery** ([link](https://24by7print.com/)); Print Arabia: COD, bank transfer, cheques ([home](https://www.printarabia.ae/)) | Show emirate-specific delivery estimate at option stage; consider COD / bank transfer for B2B. |
| U12 | **Automatic page-count reading.** | 24by7 "reads your page count automatically" ([link](https://24by7print.com/)) | Already in draft (page count vs sides); also auto-set single/double-sided from page count. |

---

## 5. Preflight checks, ranked by print-failure impact

### 5.1 Standards baseline

- **Page boxes (ISO 32000-1).** MediaBox is required. CropBox defaults to MediaBox. BleedBox, TrimBox and ArtBox are optional (PDF 1.3+) and default to the CropBox. TrimBox "shall define the intended dimensions of the finished page after trimming". BleedBox is the clip region "in a production environment" ([ISO 32000-1 §7.7.3.3 Table 30 and §14.11.2, Adobe-hosted copy](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf)). Default user-space unit is 1/72 inch, so mm = pt × 25.4 / 72. Also account for `/Rotate` and `UserUnit`.
- **PDF/X.** PDF/X-1a (ISO 15930-1/-4) is CMYK + spot only ([ISO 15930-1](https://www.iso.org/standard/29061.html), [ISO 15930-4](https://www.iso.org/standard/39938.html)). PDF/X-4 (ISO 15930-7:2010) allows colour-managed CMYK/RGB/spot plus live transparency and was confirmed current in 2026 ([ISO 15930-7](https://www.iso.org/standard/55843.html)). PDF/X-1a/X-3 require TrimBox and BleedBox; X-4 requires TrimBox or ArtBox, not larger than BleedBox (secondary: [prepressure](https://www.prepressure.com/pdf/basics/page-boxes)).
- **Ghent Workgroup.** GWG publishes commercial-print specs in two generations, based on PDF/X-4 (modern) and PDF/X-1a (older) ([GWG](https://gwg.org/commercial-print/)). GWG 2022 is a structured spreadsheet ([GWG 2022](https://gwg.org/technical-specifications/gwg-2022-specifications/)). We could not download the spreadsheet (behind a download gate), so its exact thresholds are **unverified** here. A secondary summary of GWG-style checks lists: minimum image resolution 150 ppi for offset, maximum 450 ppi, fonts embedded, no white overprint, no knock-out black text under 12pt, and total ink 245–320% depending on process ([prepressure preflight](https://www.prepressure.com/pdf/basics/preflight)).
- **Colour.** ECI/bvdm/Fogra recommend "ISO Coated v2 (ECI)" on FOGRA39L. Maximum ink was reduced from 350% to **330%**, with a 300% variant for heat-set web. PSO Coated v3 (FOGRA51) is the newer premium-coated condition ([ECI offset](https://eci.org/doku.php?id=en:colorstandards:offset)). Laminated conditions FOGRA49 (matt) and FOGRA50 (gloss) exist because lamination shifts colour (same page). Relevant when Hurrah offers lamination.
- **Bleed / safe zone.** 3mm bleed and 5mm safe zone are the stated UAE norm ([PrintOnline](https://www.printonline.ae/flyer-offer.html), [Color Spot](https://colorspotprints.com/product/flyer-printing-dubai/), [Perklets](https://perkletz.com/flyers/)). Vistaprint uses 0.137" ≈ 3.5mm ([help](https://www.vistaprint.com/customer-care/help-center/360059872652)).
- **Most common real failures:** wrong colour mode, low resolution, missing bleed, wrong dimensions and fonts (secondary vendor blog: [Esko](https://www.esko.com/en/blog/20-ways-to-eliminate-prepress-errors); secondary: [SOS Print](http://www.sos.com.au/index.php/tips-info/the-top-seven-file-issues-in-prepress/)). Pixart's PRO check lists dimensions, resolution, unembedded/unoutlined fonts, Pantone colours and page count vs order (search snippet of [Pixart help](https://support.pixartprinting.com/hc/en-us/articles/18366648721682-PRO-File-Check-Fix)).

### 5.2 Ranked checks

Libraries: **pdfium** = pypdfium2 (BSD-3-Clause / Apache-2.0); **pike** = pikepdf (MPL-2.0); **pypdf** (BSD-3-Clause); **gs** = Ghostscript (AGPL-3.0-or-later, run as a separate process); **pdf.js** = in-browser only.

| Rank | Check | Why it matters for flyers | Severity | Standard / source | Implement with |
|---|---|---|---|---|---|
| 1 | **Trim size = ordered size** (±1mm, either orientation). Use TrimBox → else CropBox → else MediaBox. If no TrimBox, try MediaBox minus 3mm per side. | Wrong size → reprint or distorted scaling. Most expensive mistake. | Error (offer U4 choices) | ISO 32000-1 §14.11.2 | pdfium `get_trimbox/get_mediabox` ([source](https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/page.py)); pike/pypdf `page.trimbox` ([pypdf docs](https://pypdf.readthedocs.io/en/stable/user/cropping-and-transforming.html), [pikepdf docs](https://pikepdf.readthedocs.io/en/latest/api/models.html)). **pdf.js cannot** (only `view` = Media∩Crop, [source](https://github.com/mozilla/pdf.js/blob/master/src/core/document.js)) |
| 2 | **Bleed present:** BleedBox ≥ trim + 2.5mm each side, **and** content actually reaches the bleed edge (render the strip between trim and bleed; flag if blank while the trim edge is non-white) | White slivers at edges; every UAE spec page asks for 3mm bleed; listed among top errors (secondary) | Error if art touches trim with no bleed; else info | UAE printer specs above | Boxes via pdfium/pike; edge render via pdfium `render` (permissive) |
| 3 | **Page count vs sides** (1 = single, 2 = double; >2 = wrong file / multi-design) | Wrong back or missing back | Error | Pixart check list (snippet) | pypdf/pike/pdfium page count |
| 4 | **Effective image resolution** (placed ppi) | Blurry photos; common with SME/Canva/web images | **Error below 150 ppi, warning below 250** (draft's hard 300 is too strict) | prepressure/GWG summary (secondary) | **pdfium `PdfImage.get_metadata()` gives on-page DPI directly** ([source](https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/pageobjects.py)); PyMuPDF `get_image_info` (AGPL); pike needs manual CTM maths |
| 5 | **Fonts embedded** (or outlined) | Font substitution; **Arabic text breaks badly** if substituted (joining forms lost, see [W3C alreq](https://www.w3.org/TR/alreq/)) | Error | Pixart PRO check flags unembedded fonts (snippet); PDF/X font-embedding clause not read here (unverified) | pdfium `PdfFont.is_embedded` ([source](https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/pageobjects.py)); pike: check FontDescriptor FontFile/FontFile2/FontFile3 |
| 6 | **Important content inside safe zone** (text/logo bbox ≥ 3–5mm inside trim) | Text cut off at trim | Warning | UAE 5mm safe norm | pdfium text-page / object `get_bounds`; pdfplumber (MIT) |
| 7 | **Colour space: RGB / Lab / ICC-RGB objects** | Colour shift (bright RGB blues/greens go dull). Real but usually cosmetic on flyers | Warning + "we'll convert using FOGRA39/PSO Coated v3" | ECI profiles; PDF/X-1a forbids RGB, X-4 allows managed RGB | pike (image `/ColorSpace`, content ops `rg/RG` vs `k/K`); pdfium image metadata colorspace |
| 8 | **Total ink coverage** > 330% (coated) / 300% (uncoated) | Set-off, drying problems on heavy dark areas | Warning | ECI 330/300% | gs `ink_cov` gives **page average only** ([gs devices](https://ghostscript.readthedocs.io/en/latest/Devices.html)); max local TAC needs CMYK render (gs `tiffsep` or custom) — implementation **unverified**; Later |
| 9 | **Encrypted / damaged / non-PDF input; /Rotate; UserUnit; JPG/PNG upload** | Crashes or wrong orientation; SMEs upload images | Error / auto-handle | ISO 32000-1 | pike (qpdf repair); pdfium; for images compute size from px ÷ DPI |
| 10 | **Crop/registration marks inside TrimBox** or MediaBox with marks but no TrimBox | Marks printed on the flyer | Warning | ISO 32000-1 boxes | Boxes + render |
| 11 | **Small rich-black text / 4-colour thin text; hairlines < 0.25pt** | Blurry text from misregistration; lines vanish | Warning (Launch) | GWG summary (secondary) | pdfium text objects + fill colour; path stroke widths (pike content stream parsing) |
| 12 | **White overprint; spot/Pantone colours** | Objects disappear; unexpected spot plates | Warning (Launch) | GWG summary (secondary); Pixart flags Pantone | pike (ExtGState `/OP`, `/Separation` colour spaces) |
| 13 | **Transparency** | Only a risk if the RIP needs X-1a flattening | Info (Later) | ISO 15930-7 vs -4 | pike (`/SMask`, `/Group /S /Transparency`) |
| 14 | **PDF/X conformance claim** (OutputIntent present) | Nice to have; don't require it from SMEs | Info | ISO 15930 | pike reads `/OutputIntents` |

**Demo cut:** checks 1–5, 7 and 9 (all doable with pdfium + pike in about a day each). **Launch:** 6, 8 (average only), 10–12. **Later:** 13–14, full TAC map.

**Customer-facing language:** show 3 levels (✅ ok / ⚠️ we can print but… / ⛔ must fix), with a picture of the problem on the preview (e.g. highlight the low-DPI image). SMEs (S7) do not understand "BleedBox".

---

## 6. Library / editor comparison

### 6.1 PDF reading, preflight and rendering

| Library | Licence (exact) | Latest seen | Boxes | Image effective DPI | Fonts embedded | Colour spaces | Render | Notes |
|---|---|---|---|---|---|---|---|---|
| **pdf.js** | Apache License 2.0 ([LICENSE](https://github.com/mozilla/pdf.js/blob/master/LICENSE)) | v6.3.289, 2026-08-29 (GitHub API) | **Only `view` (Media∩Crop), `rotate`, `userUnit`**. No Trim/Bleed ([api.js](https://github.com/mozilla/pdf.js/blob/master/src/display/api.js), [document.js](https://github.com/mozilla/pdf.js/blob/master/src/core/document.js)) | No public API | No public API | No | Yes (browser) | Use for preview only; draw trim/bleed/safe lines from backend-supplied box coordinates |
| **pypdfium2** (PDFium) | "BSD-3-Clause, Apache-2.0, dependency licenses" (PyPI metadata, v5.13.0) | 5.13.0 | Media/Crop/Bleed/Trim/Art ([page.py](https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/page.py)) | **Yes**: `get_metadata()` "DPI values signify the resolution of the image on the PDF page" ([pageobjects.py](https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/pageobjects.py)) | **Yes** `is_embedded()` | Image colourspace in metadata | Yes (thumbnails, bleed-edge sampling) | **Recommended core preflight engine** |
| **pikepdf** (qpdf) | Mozilla Public License 2.0 ([LICENSE](https://github.com/pikepdf/pikepdf/blob/main/LICENSE.txt)); qpdf Apache-2.0 | 10.13.0 | Yes ([docs](https://pikepdf.readthedocs.io/en/latest/api/models.html)) | Manual (image px + CTM) | Via dictionaries | Yes, full object access; `PdfImage.colorspace/icc` | No | Low-level checks (OutputIntent, overprint, spot, repair broken PDFs); MPL is file-level copyleft, fine for SaaS |
| **pypdf** | BSD-3-Clause ([LICENSE](https://github.com/py-pdf/pypdf/blob/main/LICENSE)) | 6.19.0 | Yes `page.trimbox` etc. ([docs](https://pypdf.readthedocs.io/en/stable/user/cropping-and-transforming.html)) | No placement info ([docs](https://pypdf.readthedocs.io/en/stable/user/extract-images.html)) | Via dictionaries | Via dictionaries | No | Pure Python; fine for boxes/page count; redundant with pikepdf |
| **PyMuPDF** | "Dual Licensed - GNU AFFERO GPL 3.0 or Artifex Commercial License" (PyPI, v1.28.2); COPYING = AGPL v3 ([repo](https://github.com/pymupdf/PyMuPDF/blob/main/COPYING)) | 1.28.2 | Yes `trimbox/bleedbox/artbox` ([docs](https://pymupdf.readthedocs.io/en/latest/page.html)) | Yes `get_image_info`/`get_image_bbox` | `get_fonts` | Yes | Yes | Technically strongest, but AGPL network-use terms are a risk for a closed SaaS. Commercial price: "Contact Sales" ([Artifex](https://artifex.com/licensing)); third-party claim of $10k–50k/yr is **unverified** |
| **Ghostscript** | "GNU Affero General Public License … version 3 … or (at your option) any later version" ([LICENSE](https://github.com/ArtifexSoftware/ghostpdl/blob/master/LICENSE)); commercial via Artifex | — | — | — | — | CMYK conversion (`-sColorConversionStrategy=CMYK`), PDF/X output (`-dPDFX`, `PDFX_def.ps`) ([docs](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html)) | `ink_cov` page-average coverage ([docs](https://ghostscript.readthedocs.io/en/latest/Devices.html)) | Useful in **prepress** (RGB→CMYK, normalising). Run unmodified as a separate CLI process; **get legal sign-off** on AGPL before production use |
| pdfplumber / pdfminer.six | MIT (PyPI) | 0.11.10 / 20260107 | pdfplumber lacks Trim/Bleed attrs ([issue](https://github.com/jsvine/pdfplumber/issues/1313)) | — | — | — | — | Optional for text bbox (safe-zone check) |

### 6.2 Online design editors

| Editor | Licence / pricing as stated | Print output | Arabic / RTL | Fit for Hurrah |
|---|---|---|---|---|
| **Polotno SDK** (built on Konva) | Commercial subscription. **Grass Roots $249/mo or $2,490/yr** (manual review; "<50" staff, lower-purchasing-power markets); **Self-Serve $899/mo or $9,990/yr** (unlimited on one domain/brand family); **Enterprise custom**; 60-day dev trial ([pricing](https://polotno.com/sdk/pricing)). One app per brand family; no source code; may not build a competing editor ([licence](https://polotno.com/legal/license)). Cloud Render API billed extra ([docs](https://polotno.com/docs/cloud-render-api)) | `saveAsPDF` with `includeBleed`, crop marks, TrimBox ⊆ BleedBox ⊆ MediaBox; PDF/X-4 / X-1a with `colorMode: 'cmyk'` + ICC; fonts embedded as subsets ([PDF export](https://polotno.com/docs/pdf-export)); cloud: FOGRA39, vector PDF (alpha) | **Unverified**: nothing found in docs index | Fastest route to a Canva-like editor; confirm Arabic shaping in a spike first |
| **IMG.LY CE.SDK** | **Custom pricing only**, 30-day trial ([pricing](https://img.ly/pricing)) | Base export turns CMYK/spot into RGB; **Print Ready PDF plugin** does RGB→CMYK with FOGRA39/GRACoL ICC and PDF/X-4 (X-3 fallback) in-browser via WASM ([plugin](https://img.ly/docs/cesdk/js/plugins/print-ready-pdf-iroalu/), [print export](https://img.ly/docs/cesdk/js/export-save-publish/for-printing-bca896/)) | **Yes**: automatic RTL, Unicode bidi, Arabic contextual forms/ligatures ([docs](https://img.ly/docs/cesdk/js/text/language-support-a0f010/)) | Best documented Arabic support; price unknown |
| **Customer's Canvas** (Aurigma) | Pricing **unverified** (no public prices found; site is JS-rendered) ([site](https://customerscanvas.com/)) | Site claims PDF/X-4, CMYK, spot colours, cut lines, built-in preflight ([site](https://customerscanvas.com/)) | **Unverified** | Full web-to-print platform; likely enterprise-priced |
| **PitchPrint** | Basic **$29/mo** (500 projects, then $0.20); Premium **$49/mo** (750, PDF/AI uploads); Agency **$199/mo**; billed annually; 14-day trial ([pricing](https://pitchprint.com/pricing)) | Not stated on pricing page | 35 languages; RTL **unverified** | Mainly for Shopify/WooCommerce; "custom solutions" listed. Cheapest hosted option to test |
| **Zakeke** | Pricing **unverified** (page is JS-only) ([pricing](https://admin.zakeke.com/en-US/pricing)) | Unverified | Unverified | Product-customiser focus (apparel/packaging), more relevant later |
| **Fabric.js** | MIT ([LICENSE](https://github.com/fabricjs/fabric.js/blob/master/LICENSE)) | No native PDF; SVG export (`toSVG`) → your own PDF pipeline ([Textbox API](https://fabricjs.com/api/classes/textbox/)) | Has a `direction` property with RTL keyboard handling (docs summary; shaping quality **unverified**) | DIY: 3–6+ dev-months to reach print-grade (estimate) |
| **Konva** | MIT ([LICENSE](https://github.com/konvajs/konva/blob/master/LICENSE)) | Docs show **raster** PDF via jsPDF only, and say CMYK/PDF/X "needs a render step outside the browser", pointing to Polotno ([Konva PDF](https://konvajs.org/docs/sandbox/Canvas_to_PDF.html)) | Unverified | Not suitable alone for print |

**Recommendation:** no editor for the demo or launch. After launch, run a 1-week spike comparing **Polotno Grass Roots/Self-Serve** and **CE.SDK** (quote) on one test: *bilingual Arabic/English A5 flyer → PDF/X-4 CMYK with 3mm bleed → passes Hurrah's own preflight*. Fabric/Konva DIY only if both fail on price.

---

## 7. UAE-specific requirements

### 7.1 Language, fonts, RTL
- **Arabic must be supported everywhere:** site UI, templates and design service. Dubai's economic department (CCCP) required Arabic as the main language on invoices, receipts, menu cards and price tags (secondary: [Gulf News, 2018](https://gulfnews.com/amp/story/business%2Fcccp-launches-new-arabic-initiative-1.1827607)). That directly affects restaurant menus (S1).
- **Arabic advertising rules:** a law-firm summary says Arabic should be the main language of advertising content and must match any foreign-language text (secondary: search summary of [Al Tamimi](https://www.tamimi.com/law-update/technology-edition/articles/media-law-and-advertising-standards-in-the-uae-key-rules-and-restrictions/), page not readable). The governing federal law is Decree-Law 55/2023 on media regulation, whose definition of advertisement covers printed/paper content (search summary; primary text: [uaelegislation.gov.ae](https://uaelegislation.gov.ae/en/legislations/2145/download), [UAE Media Council](https://uaemc.gov.ae/en/media-legislation/)). Exact wording is **unverified**.
- **Technical:** Arabic needs contextual joining (initial/medial/final forms), bidi ordering and mixed numerals, and per-letter styling breaks joins ([W3C Arabic Layout Requirements](https://www.w3.org/TR/alreq/)). For uploads this means **embedded fonts are critical** (check #5), and outlined text is acceptable. Preview with pdf.js is fine because it renders embedded glyphs. For any editor, Arabic shaping must be proven before purchase (section 6.2).
- **Template fonts:** the Dubai Font is a government-commissioned Latin + Arabic family (secondary: [Wikipedia](https://en.wikipedia.org/wiki/Dubai_(typeface))). Check its licence before bundling (**unverified**).

### 7.2 Permits and advertising rules affecting flyer content
Hurrah should **inform, not enforce**. Offer an optional checklist and fields; the customer stays responsible.

| Rule | Who | Evidence | Product feature |
|---|---|---|---|
| Real-estate adverts, including **printed advertisements**, need a DLD permit via Trakheesi. AED 1,000 + AED 20 knowledge fee; 1 working day; companies only; brokers need a marketing contract with the owner | Dubai Land Department | [DLD Real Estate Ad Permit](https://dubailand.gov.ae/en/eservices/real-estate-ad-permit/), [DLD permit request](https://dubailand.gov.ae/en/eservices/request-a-real-estate-permit/) | S2 checkbox "I have a DLD/Trakheesi permit" + permit-number field. Whether the number/QR must appear on print is **unverified** on DLD pages |
| Flyer/leaflet distribution needs approval (DED, now DET), a sample with **Arabic**, and the **Consumer Rights logo** with permit number on flyers | Dubai DET (formerly DED) | **Secondary:** [Leads Dubai](https://www.leadsdubai.com/flyer-distribution-company-dubai/) (quotes DED officials); snippet of [neighbourhood.ae FAQ](https://neighbourhood.ae/about-us/faqs/). Official [consumerrights.gov.ae logo guidelines](https://consumerrights.gov.ae/en/about-consumer-rights/logo-guidelines) and [DET consumer protection](https://www.dubaidet.gov.ae/en/licences-and-permits/business-and-consumer-protection) returned 403 → **unverified** | Template slot for the Consumer Rights logo; info panel "Distributing in Dubai? You may need DET approval" |
| Sales/discount promotions need a promotion permit per campaign | Dubai DET | Search snippets + [DET retail promotion service](https://www.dubaidet.gov.ae/en/our-services/for-consumers-and-students/apply-retail-promotion-certificate) (403) → **unverified** | S3 checklist item |
| Handing out/leaving flyers in public spaces or on cars without approval is fined | Dubai Municipality | Search summary only (AED 2,000 figure **unverified**); DM advertising permit portal ([portal](https://portal.dm.gov.ae/ADV/Overview.html), 503) | FAQ text only |
| Medical/health adverts (incl. brochures and flyers) need prior health-authority approval | DHA (Dubai), MOHAP | Secondary: [CMS expert guide](https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/united-arab-emirates); DHA social-media standards ([DHA PDF](https://dha.gov.ae/uploads/042022/Standards%20for%20Medical%20Advertisement%20Content%20in%20Social%20Media2022433965.pdf)) | S6 checklist item |
| Free-zone jurisdictions have their own permits (e.g. DDA advertising permit) | Dubai Development Authority | [DDA](https://dda.gov.ae/en/planning-development/advertising-and-events/advertising-services/advertising-permit) | FAQ |

### 7.3 Delivery, VAT, payments, calendar
- **Same-day Dubai with cut-offs** is standard (section 3). Other emirates are usually next business day ([Print Arabia](https://www.printarabia.ae/flyer-printing-dubai), [24by7](https://24by7print.com/)).
- **Business days:** Print Arabia excludes **Sat, Sun and holidays** ([link](https://www.printarabia.ae/express-flyer-printing-dubai)). The delivery-date engine needs a UAE holiday calendar (Eid dates move each year) and Ramadan working hours (**unverified**; ask client).
- **VAT 5%:** UAE printers show VAT-inclusive prices ([Print Arabia](https://www.printarabia.ae/flyer-printing-dubai), [Dubaiprint](https://www.dubaiprint.com/flyers)). Whether the FTA legally requires VAT-inclusive display is **unverified** (FTA pages not readable: [FTA tax invoices](https://www.tax.gov.ae/en/taxes/vat/vat.topics/tax.invoices.aspx)). Launch needs FTA-compliant tax invoices (TRN, etc.); confirm with the client's accountant.
- **Payment:** cash on delivery and bank transfer are offered by UAE printers ([24by7](https://24by7print.com/), [Print Arabia](https://www.printarabia.ae/)).
- **Communication:** WhatsApp is the main support channel on several UAE sites ([UAE Business Card](https://uaebusinesscard.com/flyer-printing), [Printezar](https://printezar.com/flyer-printing-uae)).
- **Seasonal peaks:** Ramadan/Eid, back-to-school, DSF/sale seasons. Templates and capacity planning should match (**analysis**).

---

## 8. Revised feature list

Tags: **Added / Kept / Moved / Cut** compared with the draft. Segments S1–S10 from section 2.

### 8.1 Demo (client demo; happy path end-to-end)

| Feature | Tag | Segments | Notes |
|---|---|---|---|
| Sizes A6, A5, A4, A3, DL (99×210) with ±1mm tolerance so 100×210 also passes | Kept (tolerance Added) | all | Square 120×120 later |
| Papers: 130 / 170gsm gloss, 350gsm gloss or matt card; 250gsm and uncoated as options | Kept (re-weighted) | S1, S3, S4, S10 / S2, S6 | Matches UAE offerings |
| Single / double sided, auto-suggested from page count | Kept + Added auto | all | |
| Qty tiers 100/250/500/1,000/2,500/5,000 + "custom quote >5,000" | Kept + Added quote | S3, S8 | |
| Turnaround **Standard / Express / Same-day Dubai** with cut-off countdown and delivery date by emirate | Moved/expanded (same-day Added) | S2, S4, S8 | UAE norm |
| Price grid qty × turnaround, AED incl. VAT with ex-VAT shown, per-piece price | Added | all | U5 |
| Upload PDF (**also JPG/PNG** with size-from-DPI) | Kept + Added images | S7, S10 | |
| Backend box extraction (Trim/Bleed/Media) with pypdfium2 → boxes sent to frontend | Added (tech) | all | pdf.js can't read boxes |
| Preflight report: size match, bleed, page count, effective ppi (error <150 / warn <250), fonts embedded, RGB warning, encrypted/rotated | Kept (DPI threshold changed, 2 checks added) | all | Section 5 ranks 1–5, 7, 9 |
| Size-mismatch choices: switch size / fit / fill / re-upload | Added | S7, S8 | U4 |
| pdf.js preview with trim/bleed/safe lines + highlight of problem areas | Kept (+highlight) | all | |
| "Use same artwork for back" | Kept | S7, S10 | |
| **Proof approval screen** (soft proof + checklist + cut-off) | Moved from Phase 2 | all | |
| "Need a design?" brief form / WhatsApp CTA | Added | S1, S6, S7, S10 | No editor |
| Bilingual UI copy stub (EN + AR, RTL layout toggle) | Added | S1, S5, S10 | Show client early; full Arabic at launch |

### 8.2 Launch (real customers, real money)

| Feature | Tag | Segments | Notes |
|---|---|---|---|
| Full Arabic UI (RTL), Arabic product copy, Arabic invoices | Added | all | CCCP Arabic rule (secondary) |
| Folds: half, tri, Z (as "Folded leaflets/menus" product using same engine) | Moved from Phase 2 | S1, S5, S6 | Menus need folds |
| Lamination: gloss / matt / velvet (+1 day) | Moved from Phase 2 | S1, S2, S6 | UAE sites offer it |
| Downloadable templates per size/fold (PDF/AI/IDML + Canva dimension guide) | Moved from Phase 2 | S5, S7, S10 | |
| Paid **Expert file check** (human, same-day SLA) | Moved from Phase 3 | S7, S8 | Pixart $5, Helloprint £2.99–19.99 |
| Fixed-price **design service** packages incl. bilingual | Added | S1, S2, S6, S7 | Vistaprint $10 benchmark; UAE tiers |
| Reorder (copy file + options; size change → re-preflight) | Moved from Phase 2 | S1, S5, S8 | |
| Preflight additions: safe-zone text check, avg ink coverage, marks in trim, rich-black small text, hairlines, white overprint, spot colours | Added | S8, S9 | Section 5 ranks 6, 8, 10–12 |
| Prepress normalisation (RGB→CMYK with ECI profile, flatten if needed) **inside production, not customer-facing** | Changed (from Phase 3 auto-fix) | all | Ghostscript as separate process after AGPL legal check |
| Optional compliance checklist: DLD permit no. (real estate), DET/Consumer Rights logo, DHA (clinics), promo permit | Added | S2, S3, S6 | Inform, don't enforce |
| Delivery engine: emirate-specific delivery dates, UAE holidays, cut-offs; COD/bank transfer option | Added | all | Confirm with client |
| FTA-compliant tax invoice, B2B account (TRN, PO number) | Added | S8, S9 | |
| Order status notifications (email + WhatsApp) | Added | all | |
| Data-driven product/option schema (size × paper × finish constraints, per-product preflight profile) | Added (architecture) | future 150 products | Needed before adding products |

### 8.3 Later

| Feature | Tag | Segments | Notes |
|---|---|---|---|
| Online designer (templates, text, images, logo, QR, PDF/X-4 export) after a Polotno vs CE.SDK spike on Arabic | Moved from Phase 2 → Later | S1, S5, S7, S10 | Arabic shaping is the deciding test |
| Saved designs / brand kit | Moved from Phase 2 | S8, S9 | Depends on editor |
| Door hangers, rack cards, DL menus, square flyers | Added | S1, S2, S6 | Same engine |
| Perforation / tear-off coupons, hot foil | Added | S1, S3 | UAE sites offer |
| Multiple designs in one order (split qty) | Added (replaces VDP) | S2, S8 | MOO Printfinity pattern |
| Paper sample pack | Added | S8, S9 | |
| Mirrored-bleed auto-fix (with customer approval preview) | Kept in later phase | S7 | Only with visible preview |
| Max-local TAC heatmap, transparency, PDF/X conformance | Added | S8 | |
| Spot UV, rounded corners, die-cut shapes on flyers | Moved Phase 2 → Later | S2, S4 | Premium niche |
| Artwork chat inside site | Cut (use WhatsApp + expert check) | — | |
| Customer-facing RGB→CMYK auto-convert option | Cut (do in prepress) | — | |
| Variable data printing | Cut for flyers (revisit for business cards/direct mail) | — | |

---

## 9. Open questions for the client

1. **Production:** in-house presses or outsourced? Digital (short-run) vs offset (long-run) split and the quantity where it switches? This sets the paper list and qty tiers.
2. **Same-day capacity:** is same-day Dubai delivery realistic? What are the cut-off times and delivery windows? Which emirates are next day?
3. **Proof policy:** will staff review every file before print (like Print Arabia), or will the automatic preflight + customer approval go straight to production for "all green" files?
4. **Design service:** is there an in-house designer? Price per package? Is bilingual Arabic/English design offered? Target turnaround?
5. **Expert file check:** offer it? Price (e.g. AED 15–25)? SLA?
6. **Which ICC profile / press condition** does their printer use (ISO Coated v2 / PSO Coated v3 / uncoated)? Their TAC limit? Their bleed (3mm?) and safe zone (3 or 5mm)?
7. **Target first segments:** restaurants, real estate, SMEs or agencies? This decides whether design help or strict PDF checks come first.
8. **Arabic:** full Arabic UI at launch? Arabic-speaking support staff?
9. **Compliance stance:** show a permit checklist? Collect DLD permit numbers? Any legal advice already received?
10. **Payments:** card only, or also COD, bank transfer, B2B credit terms?
11. **Budget for an editor licence** after launch (Polotno is $2,490–$9,990/yr; CE.SDK by quote)? Canva-first acceptable instead?
12. **Licensing risk appetite:** OK to run Ghostscript (AGPL) as an unmodified separate process after legal review, or buy a commercial licence, or avoid it?
13. **Reseller/agency accounts:** trade pricing, blind shipping, white-label invoices?
14. **Delivery calendar:** Saturday/Sunday production? Ramadan hours? Public holiday handling?
15. **Existing price list** for flyers (AED, by size/paper/qty/turnaround) to seed the price grid?

---

## 10. Sources

Checked 2026-09-17. (P) = primary; (S) = secondary; (U) = unreadable to our fetcher; content from search snippet only.

**UAE printers**
1. (P) Print Arabia – Standard flyers: https://www.printarabia.ae/flyer-printing-dubai
2. (P) Print Arabia – Express flyers: https://www.printarabia.ae/express-flyer-printing-dubai
3. (P) Print Arabia – Home: https://www.printarabia.ae/
4. (P) Printo UAE – Express flyers: https://printo.ae/product/express-flyer-printing-dubai/
5. (P) PrintOnline.ae – Flyer offer: https://www.printonline.ae/flyer-offer.html
6. (P) Dubaiprint.com – Flyers: https://www.dubaiprint.com/flyers
7. (P) Perklets Print – Flyers: https://perkletz.com/flyers/
8. (P) Color Spot – Flyer printing Dubai: https://colorspotprints.com/product/flyer-printing-dubai/
9. (P) Printezar – Flyer printing UAE: https://printezar.com/flyer-printing-uae
10. (P) 24by7 Print – Home: https://24by7print.com/
11. (P) UAE Business Card – Flyers: https://uaebusinesscard.com/flyer-printing
12. (U) Al Raha Print: https://www.alrahaprint.com/flyer-printing/ ; DLX Print: https://www.dlxprint.com/flyers-printing-dubai.html

**International printers**
13. (P) Vistaprint – Flyers: https://www.vistaprint.com/marketing-materials/flyers
14. (P) Vistaprint – Flyer design service: https://www.vistaprint.com/experts/services/details/flyers?mpvId=flyers&locale=en-US
15. (P) Vistaprint – Full bleed vs trim: https://www.vistaprint.com/customer-care/help-center/360059872652
16. (P) Vistaprint – Stretch to full bleed: https://www.vistaprint.com/customer-care/help-center/360051218651/
17. (P) Vistaprint – Reorder: https://www.vistaprint.com/customer-care/help-center/360050499971
18. (P) Vistaprint – Door hangers: https://www.vistaprint.com/marketing-materials/door-hangers
19. (P) Vistaprint – Rack cards: https://www.vistaprint.com/marketing-materials/rack-cards
20. (P) Vistaprint – Menus: https://www.vistaprint.com/marketing-materials/menus
21. (P) Vistaprint – Flyer templates: https://www.vistaprint.com/marketing-materials/flyers/templates
22. (P) UPrinting – Flyers: https://www.uprinting.com/flyer-printing.html
23. (P) UPrinting – Leaflets: https://www.uprinting.com/leaflet-printing.html
24. (P) 4over4 – Flyers: https://www.4over4.com/product/flyers ; category (snippet): https://www.4over4.com/printing/category/flyer-printing
25. (P) PrintingCenterUSA – Flyers: https://www.printingcenterusa.com/printing/flyer-printing ; templates: https://www.printingcenterusa.com/templates/flyer
26. (P) Pixartprinting – Flyers: https://www.pixartprinting.com/digital-litho-printing/printing-leaflets-flyers/
27. (P) Pixartprinting – PRO File Check & Fix: https://support.pixartprinting.com/hc/en-us/articles/18366648721682-PRO-File-Check-Fix
28. (U) Helloprint – Artwork check: https://www.helloprint.com/en-us/artwork-check ; A5: https://www.helloprint.com/en-gb/flyera5 ; delivery: https://www.helloprint.com/en-us/delivery-services
29. (P) Print.com – Flyers & leaflets: https://www.print.com/en/flyers-leaflets/
30. (P) MOO – Flyers: https://www.moo.com/uk/flyers ; Printfinity: https://www.moo.com/us/about/printfinity
31. (U) Printed.com – Flyers: https://www.printed.com/leaflets-and-flyers/flat-leaflets-and-flyers
32. (U) Canva – Where Canva prints and ships: https://www.canva.com/help/where-canva-prints-ships/
33. (U) Solopress – Leaflets & flyers: https://www.solopress.com/leaflets-flyers/

**Standards and technical**
34. (P) ISO 32000-1:2008 (Adobe-hosted copy): https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/PDF32000_2008.pdf
35. (P) ISO 15930-7:2010 PDF/X-4: https://www.iso.org/standard/55843.html
36. (P) ISO 15930-1:2001 PDF/X-1a: https://www.iso.org/standard/29061.html
37. (P) ISO 15930-4:2003 PDF/X-1a (PDF 1.4): https://www.iso.org/standard/39938.html
38. (P) Ghent Workgroup – Commercial print: https://gwg.org/commercial-print/
39. (P) GWG 2022 specifications: https://gwg.org/technical-specifications/gwg-2022-specifications/
40. (P) ECI – Offset colour standards: https://eci.org/doku.php?id=en:colorstandards:offset
41. (S) prepressure.com – Page boxes: https://www.prepressure.com/pdf/basics/page-boxes
42. (S) prepressure.com – Preflight: https://www.prepressure.com/pdf/basics/preflight
43. (S) Esko – 20 prepress errors: https://www.esko.com/en/blog/20-ways-to-eliminate-prepress-errors
44. (S) SOS Print – Top seven file issues: http://www.sos.com.au/index.php/tips-info/the-top-seven-file-issues-in-prepress/
45. (P) W3C – Arabic Layout Requirements: https://www.w3.org/TR/alreq/

**Libraries and editors**
46. (P) pdf.js LICENSE: https://github.com/mozilla/pdf.js/blob/master/LICENSE ; api.js: https://github.com/mozilla/pdf.js/blob/master/src/display/api.js ; document.js: https://github.com/mozilla/pdf.js/blob/master/src/core/document.js
47. (P) pypdfium2 source: https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/pageobjects.py , https://github.com/pypdfium2-team/pypdfium2/blob/main/src/pypdfium2/_helpers/page.py ; PyPI: https://pypi.org/project/pypdfium2/
48. (P) pikepdf repo/LICENSE: https://github.com/pikepdf/pikepdf ; docs: https://pikepdf.readthedocs.io/en/latest/api/models.html
49. (P) pypdf LICENSE: https://github.com/py-pdf/pypdf/blob/main/LICENSE ; docs: https://pypdf.readthedocs.io/en/stable/user/cropping-and-transforming.html , https://pypdf.readthedocs.io/en/stable/user/extract-images.html
50. (P) PyMuPDF COPYING: https://github.com/pymupdf/PyMuPDF/blob/main/COPYING ; Page docs: https://pymupdf.readthedocs.io/en/latest/page.html ; PyPI: https://pypi.org/project/PyMuPDF/
51. (P) Artifex licensing: https://artifex.com/licensing
52. (P) Ghostscript LICENSE: https://github.com/ArtifexSoftware/ghostpdl/blob/master/LICENSE ; Devices: https://ghostscript.readthedocs.io/en/latest/Devices.html ; Vector devices: https://ghostscript.readthedocs.io/en/latest/VectorDevices.html
53. (P) pdfplumber issue #1313: https://github.com/jsvine/pdfplumber/issues/1313 ; PyPI pdfplumber / pdfminer.six
54. (P) Polotno pricing: https://polotno.com/sdk/pricing ; licence: https://polotno.com/legal/license ; PDF export: https://polotno.com/docs/pdf-export ; Cloud Render: https://polotno.com/docs/cloud-render-api
55. (P) IMG.LY pricing: https://img.ly/pricing ; language support: https://img.ly/docs/cesdk/js/text/language-support-a0f010/ ; print-ready plugin: https://img.ly/docs/cesdk/js/plugins/print-ready-pdf-iroalu/ ; export for printing: https://img.ly/docs/cesdk/js/export-save-publish/for-printing-bca896/
56. (P) Customer's Canvas: https://customerscanvas.com/
57. (P) PitchPrint pricing: https://pitchprint.com/pricing
58. (U) Zakeke pricing: https://admin.zakeke.com/en-US/pricing
59. (P) Fabric.js LICENSE: https://github.com/fabricjs/fabric.js/blob/master/LICENSE ; Textbox API: https://fabricjs.com/api/classes/textbox/
60. (P) Konva LICENSE: https://github.com/konvajs/konva/blob/master/LICENSE ; Canvas to PDF: https://konvajs.org/docs/sandbox/Canvas_to_PDF.html

**UAE government, legal and market**
61. (P) Dubai Land Department – Real Estate Ad Permit: https://dubailand.gov.ae/en/eservices/real-estate-ad-permit/ ; permit request: https://dubailand.gov.ae/en/eservices/request-a-real-estate-permit/
62. (P) Dubai Development Authority – Advertising permit: https://dda.gov.ae/en/planning-development/advertising-and-events/advertising-services/advertising-permit
63. (U) Dubai Municipality – Advertisement permits: https://portal.dm.gov.ae/ADV/Overview.html
64. (U) Dubai DET – Licences & permits: https://www.dubaidet.gov.ae/en/licences-and-permits ; consumer protection: https://www.dubaidet.gov.ae/en/licences-and-permits/business-and-consumer-protection ; retail promotion certificate: https://www.dubaidet.gov.ae/en/our-services/for-consumers-and-students/apply-retail-promotion-certificate
65. (U) Consumer Rights Dubai – Logo guidelines: https://consumerrights.gov.ae/en/about-consumer-rights/logo-guidelines
66. (P) Federal Decree-Law 55/2023 (Media): https://uaelegislation.gov.ae/en/legislations/2145/download ; UAE Media Council legislation: https://uaemc.gov.ae/en/media-legislation/
67. (U) FTA – Tax invoices: https://www.tax.gov.ae/en/taxes/vat/vat.topics/tax.invoices.aspx
68. (P) DHA – Medical advertisement standards (social media): https://dha.gov.ae/uploads/042022/Standards%20for%20Medical%20Advertisement%20Content%20in%20Social%20Media2022433965.pdf
69. (S) CMS – UAE medicines/devices advertising guide: https://cms.law/en/int/expert-guides/cms-expert-guide-to-advertising-of-medicines-and-medical-devices/united-arab-emirates
70. (S) Al Tamimi – Media law & advertising standards: https://www.tamimi.com/law-update/technology-edition/articles/media-law-and-advertising-standards-in-the-uae-key-rules-and-restrictions/
71. (S) Gulf News – CCCP Arabic initiative: https://gulfnews.com/amp/story/business%2Fcccp-launches-new-arabic-initiative-1.1827607
72. (S) Leads Dubai – Flyer distribution: https://www.leadsdubai.com/flyer-distribution-company-dubai/ ; FAQ: https://www.leadsdubai.com/flyer-distribution-faq/
73. (S) Neighbourhood Promotion – FAQs: https://neighbourhood.ae/about-us/faqs/
74. (S) Wikipedia – Dubai (typeface): https://en.wikipedia.org/wiki/Dubai_(typeface)
