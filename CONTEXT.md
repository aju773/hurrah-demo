# Hurrah

Hurrah is a UAE web-to-print shop: customers choose print products, upload artwork, approve a proof and order delivery.

## Language

### Catalogue

**Product**:
Something a customer buys as a single kind of printed item, e.g. Flyers. Its variations are expressed as Options, not as separate Products.
_Avoid_: Item, SKU (for the product itself), product variant

**Option**:
A named choice a customer makes within a Product, e.g. Size, Paper, Sides, Quantity, Turnaround.
_Avoid_: Attribute, property, variant, spec

**Paper**:
The stock an order is printed on, named as weight plus finish together (e.g. 170gsm gloss). One Option, not separate weight and finish choices.
_Avoid_: Stock, material, media

### Pricing

**Base price**:
The price list amount, excluding VAT, for one Size × Paper × Quantity combination. Everything else in a Quote is calculated from it.
_Avoid_: List price, unit price, rate

**Uplift**:
A percentage of the Base price added for a Sides or Turnaround choice (e.g. double-sided, Express). Uplifts add together; they do not compound.
_Avoid_: Surcharge, markup, premium

**Price grid**:
The Quantity × Turnaround view of Quotes a customer sees for their current Size, Paper and Sides.
_Avoid_: Price table, matrix

**Quote**:
The calculated price of one configuration: Base price, Uplifts, VAT and total. Not a custom quote request.
_Avoid_: Estimate

**Restriction**:
A rule that two Option values cannot be chosen together, with a reason the customer sees, e.g. Same-day Dubai with A3: "Same-day not available for A3".
_Avoid_: Constraint, rule, incompatibility

**Configuration**:
One chosen value for every Option of a Product, e.g. A5, 170gsm gloss, double, 1,000, Standard.
_Avoid_: Variant, selection, spec

### Artwork

**Artwork**:
A file a customer uploads for a Product, together with what was detected from it (size, sides, bleed, orientation).
_Avoid_: Upload, design, file (for the detected record)

**Trim size**:
The finished size of a printed page after cutting, e.g. A5 148×210mm. Detected from the file and matched to a Size.
_Avoid_: Page size, document size, dimensions

**Bleed**:
Artwork that extends past the Trim size so no white edge shows after cutting, measured in mm on the narrowest side.
_Avoid_: Margin, overprint

**Safe area**:
The area inside the Trim size, 5mm in from each edge, where important text and logos should sit so cutting cannot touch them. Shown as a guide; not checked in the demo.
_Avoid_: Safe zone, margin, live area

**Artwork template**:
A downloadable 2-page PDF (Front and Back) for one Size, offered for every active Size of a Product. Its page is the Trim size plus the Product's Bleed, with the trim and bleed boxes set to match, and guides drawn for the cut line, the Bleed edge and the Safe area, labelled with the Size name and measurements. Uploaded unchanged it is an exact Size match with Bleed at the Product value and "Ready to print". Built from live catalogue data and cached until a Size, Bleed or Safe value changes.
_Avoid_: Dieline, layout guide, blank

**Fit**:
Printing Artwork on a different Size by shrinking or enlarging it until the whole design fits inside the trim, leaving white borders where the shapes differ. An instruction; the file itself is not changed.
_Avoid_: Scale to fit, shrink, resize

**Fill**:
Printing Artwork on a different Size by scaling it until it covers the page to the bleed edge, cutting off whatever falls outside. An instruction; the file itself is not changed.
_Avoid_: Crop, stretch, scale to fill

**Orientation**:
Whether a page is portrait or landscape. Recorded per side; not an Option, so a Size matches either way round.
_Avoid_: Rotation, layout

**Page picker**:
The dialog that opens after a PDF of more than 2 pages (up to 50) is uploaded, showing a thumbnail of every page so the customer chooses which page is Front and which is Back (or no Back). Only the chosen pages become Artwork and get a Preflight report; the uploaded file is kept as a source file until then and expires after 24 hours if never used. Front and Back must be the same Size.
_Avoid_: Page selector, page splitter, split PDF

### Commerce

**Commerce switch**:
A server setting, off by default, that hides all money from the journey: no price, VAT, total, cart, payment or delivery amount in the pages or the API responses (omitted, not just hidden). Availability still comes from the Base price rows, so a combination with no Base price stays "Not available". Turning it on restores the Price grid and Quote.
_Avoid_: Feature flag, price toggle, demo mode

### Design help

**Design request**:
A customer's ask for artwork to be made for a Product, with their brief. Not an order; the customer uploads the finished design as Artwork like anyone else.
_Avoid_: Lead, enquiry, design order

**Browsing language**:
The language the customer was using the site in (English or Arabic). Kept on a Design request so staff reply in it. Not the language of the flyer itself, which the brief states separately.
_Avoid_: Locale (in customer-facing talk), design language

### Site chrome

**Site chrome**:
The header and footer around every page of the journey. Holds only what works in the demo: the logo, the language toggle and, in Arabic, the draft-translation pill. Anything that cannot be clicked through to a real result is left out, not greyed out.
_Avoid_: Shell, layout, navigation

### Hints

**Hints**:
Small, dismissible, non-modal tips shown once per step (options and upload, findings and preview, approval) on a visitor's first visit. Never block the page or trap focus; remembered per visitor in the browser, brought back by "Show hints", and switched off by a runtime flag for scripted demo runs.
_Avoid_: Tour, coach marks, tooltips, onboarding

### Proof and turnaround

**Proof**:
How the Artwork will print, shown back to the customer for approval together with the Configuration. Not a separate file.
_Avoid_: Soft proof, mock-up, confirmation

**Proof approval**:
The moment the customer accepts the Proof and Configuration. Turnaround is counted from it.
_Avoid_: Confirmation, sign-off, checkout

**Cut-off**:
The latest time of a Working day at which a Proof approval still counts for that day, per Turnaround (e.g. Same-day Dubai 11:00).
_Avoid_: Deadline, order-by time

**Working day**:
A day on which production runs. Turnaround is counted in Working days.
_Avoid_: Business day

### Preflight

**Preflight**:
The automatic checks run on Artwork for a Product (bleed, image resolution, fonts, colour, readable file), producing a Preflight report.
_Avoid_: File check, validation, prepress check

**Preflight report**:
The list of Findings for one Artwork slot, with the thresholds used. Re-made when Size, Fit/Fill or the Product's thresholds change.
_Avoid_: Check result, validation report

**Finding**:
One problem or remark from Preflight: which check, its Severity, the measured value and, where known, where on the page it is.
_Avoid_: Issue, error (for the record itself), flag

**Severity**:
How much a Finding matters: OK, Note (informational, nothing to accept), Warning (customer must accept; order gets a staff check) or Error (must fix before ordering; no override).
_Avoid_: Level, priority, status

### Ordering

**Order**:
A customer's submitted purchase, created at Proof approval: who it is for, where it goes, how it is paid and its Order status. Holds one Order line in the demo.
_Avoid_: Checkout, purchase, job (for the whole order)

**Order line**:
One printed item on an Order: the Product, its Configuration, Quote, Artwork and Preflight report, frozen as they were at Proof approval.
_Avoid_: Item, cart item, job

**Order status**:
Where an Order is: Staff check, In production, On hold, Out for delivery, Delivered or Cancelled. Separate from whether it is paid.
_Avoid_: State, stage, order state

**Staff check**:
A person at Hurrah looking at an Order's Artwork before printing, because the customer approved it with Warnings. Happens inside the promised delivery date.
_Avoid_: Review, manual check, file check

**Order status change**:
A record of one move between Order statuses: from, to, who, when and any note.
_Avoid_: Log entry, history, audit event
