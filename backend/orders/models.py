import secrets

from django.db import models


class Product(models.Model):
    name = models.CharField(max_length=200)
    slug = models.SlugField(unique=True)
    image_url = models.CharField(max_length=500, blank=True)
    active = models.BooleanField(default=True)

    # Print spec used by Artwork analysis (see orders/pdf_utils.py) and, later, Preflight.
    bleed_mm = models.FloatField(default=3.0)
    safe_mm = models.FloatField(default=5.0)
    size_tolerance_mm = models.FloatField(
        default=1.5,
        help_text="Detected trim size must be within this many mm of a Size value, on each axis, in either orientation.",
    )
    bleed_min_mm = models.FloatField(
        default=1.0,
        help_text="Smallest uniform bleed inferred when a file has no TrimBox and its page size doesn't exactly match a Size value.",
    )
    bleed_max_mm = models.FloatField(
        default=6.0,
        help_text="Largest uniform bleed inferred when a file has no TrimBox and its page size doesn't exactly match a Size value.",
    )
    ppi_error_below = models.FloatField(
        default=150.0, help_text="Effective image ppi below this is a Preflight Error (low_ppi)."
    )
    ppi_warn_below = models.FloatField(
        default=250.0, help_text="Effective image ppi below this (and at/above ppi_error_below) is a Preflight Warning (low_ppi)."
    )

    def __str__(self):
        return self.name


class Option(models.Model):
    """A named choice within a Product, e.g. Size, Paper, Sides, Quantity, Turnaround."""

    PRICING_ROLE_BASE = "base"
    PRICING_ROLE_UPLIFT = "uplift"
    PRICING_ROLE_NONE = "none"
    PRICING_ROLE_CHOICES = [
        (PRICING_ROLE_BASE, "Base"),
        (PRICING_ROLE_UPLIFT, "Uplift"),
        (PRICING_ROLE_NONE, "None"),
    ]

    product = models.ForeignKey(Product, related_name="options", on_delete=models.CASCADE)
    code = models.SlugField(max_length=50)
    name_en = models.CharField(max_length=100)
    name_ar = models.CharField(max_length=100, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    pricing_role = models.CharField(max_length=10, choices=PRICING_ROLE_CHOICES, default=PRICING_ROLE_NONE)
    # Lower = weaker: in a Restriction, the value on the Option with the weaker yield
    # order is the one greyed out (e.g. Turnaround yields before Size or Quantity).
    yield_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order"]
        unique_together = [("product", "code")]

    def __str__(self):
        return f"{self.product.slug}:{self.code}"


class OptionValue(models.Model):
    """One choosable value of an Option, e.g. A5 for Size, or 500 for Quantity."""

    option = models.ForeignKey(Option, related_name="values", on_delete=models.CASCADE)
    code = models.SlugField(max_length=50)
    label_en = models.CharField(max_length=100)
    label_ar = models.CharField(max_length=100, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)

    # Typed attributes; only the ones relevant to the owning Option are set.
    integer_value = models.PositiveIntegerField(null=True, blank=True)  # Quantity
    width_mm = models.FloatField(null=True, blank=True)  # Size (trim width)
    height_mm = models.FloatField(null=True, blank=True)  # Size (trim height)
    page_count = models.PositiveIntegerField(null=True, blank=True)  # Sides
    uplift_percent = models.FloatField(null=True, blank=True)  # uplift-role values
    cutoff_time = models.TimeField(null=True, blank=True)  # Turnaround
    working_day_offset = models.PositiveIntegerField(null=True, blank=True)  # Turnaround
    delivery_window_start = models.TimeField(null=True, blank=True)  # Turnaround; null = "by <end>"
    delivery_window_end = models.TimeField(null=True, blank=True)  # Turnaround

    class Meta:
        ordering = ["sort_order"]
        unique_together = [("option", "code")]

    def __str__(self):
        return f"{self.option.code}:{self.code}"


class DemoClock(models.Model):
    """A presenter-settable fix on "now" (Asia/Dubai) for the Clock module. A single
    row: null `fixed_at` means off (real wall-clock time is used), which is the
    default in production."""

    fixed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Demo clock: {'off' if self.fixed_at is None else self.fixed_at.isoformat()}"


class Restriction(models.Model):
    """Two Option values of the same Product that cannot be chosen together."""

    value_x = models.ForeignKey(OptionValue, related_name="restricted_as_x", on_delete=models.CASCADE)
    value_y = models.ForeignKey(OptionValue, related_name="restricted_as_y", on_delete=models.CASCADE)
    reason_en = models.CharField(max_length=200)
    reason_ar = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = [("value_x", "value_y")]

    def __str__(self):
        return f"{self.value_x} x {self.value_y}"


class BasePrice(models.Model):
    """The price list amount, ex-VAT, for one combination of base-role Option values."""

    product = models.ForeignKey(Product, related_name="base_prices", on_delete=models.CASCADE)
    amount_fils = models.PositiveIntegerField()
    values = models.ManyToManyField(OptionValue, related_name="base_prices")

    def __str__(self):
        return f"{self.product.slug}: {self.amount_fils} fils"


ORIENTATION_CHOICES = [
    ("portrait", "Portrait"),
    ("landscape", "Landscape"),
]

TRIM_SOURCE_CHOICES = [
    ("trimbox", "TrimBox"),
    ("crop", "CropBox"),
    ("media", "MediaBox"),
    ("media_minus_bleed", "MediaBox minus bleed"),
]

SLOT_FRONT = "front"
SLOT_BACK = "back"

SLOT_CHOICES = [
    (SLOT_FRONT, "Front"),
    (SLOT_BACK, "Back"),
]


class Artwork(models.Model):
    """A file uploaded into one Front/Back slot for a Product, together with what
    was detected from it. See orders/pdf_utils.py for the detection rules."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="artworks")
    slot = models.CharField(max_length=10, choices=SLOT_CHOICES)
    file = models.FileField(upload_to="uploads/%Y/%m/%d/")
    original_filename = models.CharField(max_length=255)
    # How many pages the uploaded file had, and which one of them this slot uses
    # (a 2-page PDF dropped into Front fills both slots from pages 1 and 2).
    source_page_count = models.PositiveIntegerField(default=0)
    page_index = models.PositiveIntegerField(default=1)

    # Nullable: null means the detected trim didn't match any of the Product's
    # active Size values (see detected_width_mm/height_mm for the measured mm).
    matched_size = models.ForeignKey(
        "OptionValue", on_delete=models.SET_NULL, null=True, blank=True, related_name="matched_artworks",
    )
    trim_width_mm = models.FloatField(null=True, blank=True)
    trim_height_mm = models.FloatField(null=True, blank=True)
    media_width_mm = models.FloatField(null=True, blank=True)
    media_height_mm = models.FloatField(null=True, blank=True)
    orientation = models.CharField(max_length=20, choices=ORIENTATION_CHOICES, blank=True)
    trim_source = models.CharField(max_length=30, choices=TRIM_SOURCE_CHOICES, blank=True)
    bleed_mm = models.FloatField(null=True, blank=True)
    rotation = models.PositiveIntegerField(default=0)

    is_valid = models.BooleanField(default=False)
    error_code = models.CharField(max_length=30, blank=True)
    error_message = models.CharField(max_length=300, blank=True)

    # {"findings": [...], "thresholds": {...}, "headline_severity": "ok"|
    # "note"|"warning"|"error"} — see orders/preflight.py.
    preflight_report = models.JSONField(default=dict, blank=True)

    # The step 2 preview: a 150dpi PNG of the page box and a 400px-longest-edge
    # thumbnail, rendered once on upload (orders/rendering.py) and referenced
    # from the preview payload (orders/views.ArtworkPreviewView).
    page_image = models.ImageField(upload_to="renders/%Y/%m/%d/", blank=True)
    thumbnail_image = models.ImageField(upload_to="renders/%Y/%m/%d/", blank=True)

    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.original_filename} ({self.slot})"


FLYER_LANGUAGE_CHOICES = [
    ("en", "English"),
    ("ar", "Arabic"),
    ("both", "Both"),
]

BROWSING_LANGUAGE_CHOICES = [
    ("en", "English"),
    ("ar", "Arabic"),
]

DESIGN_REQUEST_STATUS_CHOICES = [
    ("new", "New"),
    ("contacted", "Contacted"),
    ("closed", "Closed"),
]


class DesignRequest(models.Model):
    """A customer's ask for artwork to be made for a Product, with their brief.
    Not an order; the customer uploads the finished design as Artwork like anyone
    else once it's ready."""

    number = models.CharField(max_length=20, unique=True, editable=False)
    product = models.ForeignKey(
        Product, related_name="design_requests", on_delete=models.SET_NULL, null=True, blank=True
    )
    # {} when no Configuration was chosen yet ("Not decided yet").
    configuration_snapshot = models.JSONField(default=dict, blank=True)
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=50)
    email = models.EmailField(blank=True)
    business_name = models.CharField(max_length=200, blank=True)
    brief = models.TextField()
    flyer_language = models.CharField(max_length=10, choices=FLYER_LANGUAGE_CHOICES)
    browsing_language = models.CharField(max_length=10, choices=BROWSING_LANGUAGE_CHOICES, default="en")
    status = models.CharField(max_length=10, choices=DESIGN_REQUEST_STATUS_CHOICES, default="new")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number


def generate_order_token():
    return secrets.token_urlsafe(24)


# Blank while the Commerce switch is off: no payment is taken or recorded.
PAYMENT_METHOD_CHOICES = [("cod", "Cash/card on delivery")]

PAYMENT_STATUS_CHOICES = [
    ("unpaid", "Unpaid"),
    ("paid", "Paid"),
]

ORDER_STATUS_STAFF_CHECK = "staff_check"
ORDER_STATUS_IN_PRODUCTION = "in_production"
ORDER_STATUS_ON_HOLD = "on_hold"
ORDER_STATUS_CANCELLED = "cancelled"
ORDER_STATUS_OUT_FOR_DELIVERY = "out_for_delivery"
ORDER_STATUS_DELIVERED = "delivered"

ORDER_STATUS_CHOICES = [
    (ORDER_STATUS_STAFF_CHECK, "Staff check"),
    (ORDER_STATUS_IN_PRODUCTION, "In production"),
    (ORDER_STATUS_ON_HOLD, "On hold"),
    (ORDER_STATUS_CANCELLED, "Cancelled"),
    (ORDER_STATUS_OUT_FOR_DELIVERY, "Out for delivery"),
    (ORDER_STATUS_DELIVERED, "Delivered"),
]


class Order(models.Model):
    """A submitted, server-checked Order (ticket 10). Everything a customer
    approved is snapshotted on its one OrderLine — see ADR 0001 (orders as
    snapshots) — so later catalogue or Product changes never alter a placed
    Order."""

    number = models.CharField(max_length=20, unique=True, editable=False)
    token = models.CharField(max_length=64, unique=True, default=generate_order_token, editable=False)

    # Guest contact details (spec story 84): no account. Area and address are
    # only collected with the Commerce switch on.
    name = models.CharField(max_length=200)
    mobile = models.CharField(max_length=20)
    area = models.CharField(max_length=100, blank=True)
    address_line = models.CharField(max_length=300, blank=True)
    email = models.EmailField(blank=True)
    company = models.CharField(max_length=200, blank=True)
    note = models.CharField(max_length=500, blank=True)

    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHOD_CHOICES, default="cod", blank=True)
    payment_status = models.CharField(max_length=10, choices=PAYMENT_STATUS_CHOICES, default="unpaid", blank=True)

    status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES)
    browsing_language = models.CharField(max_length=10, choices=BROWSING_LANGUAGE_CHOICES, default="en")

    # A repeat Submit with the same key returns the existing Order instead of
    # creating a duplicate (spec story 88).
    idempotency_key = models.CharField(max_length=100, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.number


class OrderLine(models.Model):
    """Exactly one per Order in the demo. Everything the customer approved,
    frozen at approval time — no FK to Option values (labels are resolved in
    the viewer's language at display time from `configuration_snapshot`)."""

    order = models.OneToOneField(Order, related_name="line", on_delete=models.CASCADE)
    product = models.ForeignKey(Product, related_name="order_lines", on_delete=models.PROTECT)

    # [{"option": code, "name": ..., "value": code, "label": ...}, ...]
    configuration_snapshot = models.JSONField(default=list)

    # Null while the Commerce switch is off: the Quote is not part of the Order.
    base_fils = models.PositiveIntegerField(null=True, blank=True)
    subtotal_fils = models.PositiveIntegerField(null=True, blank=True)
    vat_fils = models.PositiveIntegerField(null=True, blank=True)
    total_fils = models.PositiveIntegerField(null=True, blank=True)
    # [{"label", "percent", "fils"}, ...]
    uplifts_snapshot = models.JSONField(default=list)

    # unique=True closes most of the "same Artwork on two Orders" race at the
    # database level: two concurrent Submits for the same front_artwork can
    # both pass the OrderLine.objects.filter(...).exists() pre-check before
    # either commits, but only one INSERT can win a unique column (see
    # order_views.OrderSubmitView.post's IntegrityError handling). A single
    # Artwork used as one Order's front and a different Order's back at the
    # same instant is not covered — accepted for the demo.
    front_artwork = models.OneToOneField(Artwork, related_name="+", on_delete=models.PROTECT)
    # Null when same_as_front is True.
    back_artwork = models.OneToOneField(Artwork, related_name="+", on_delete=models.PROTECT, null=True, blank=True)
    same_as_front = models.BooleanField(default=False)

    # The Turnaround value code in `configuration_snapshot`, denormalised so staff
    # can filter the Order list by it.
    turnaround = models.CharField(max_length=50, blank=True, db_index=True)

    # orders/size_choice.compute_size_choice()'s shape, or {} when the
    # customer kept the file at its own matched Size (no resize).
    size_choice = models.JSONField(default=dict, blank=True)

    # {"front": <Preflight report>, "back": <Preflight report> | None}
    preflight_report_snapshot = models.JSONField(default=dict)
    # Finding codes behind the extra approval tick, e.g. ["bleed_missing"].
    accepted_warning_codes = models.JSONField(default=list, blank=True)

    approved_at = models.DateTimeField()
    promised_date = models.DateField()
    promised_window_start = models.TimeField(null=True, blank=True)
    promised_window_end = models.TimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.order.number} line"


class OrderStatusChange(models.Model):
    """Audit trail: every Order status change, from/to/who/when/note (spec
    story 100). Written on creation (from="" to the initial status) and by
    the admin transition actions built in ticket 11."""

    order = models.ForeignKey(Order, related_name="status_changes", on_delete=models.CASCADE)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, choices=ORDER_STATUS_CHOICES)
    staff_user = models.CharField(max_length=150, blank=True)
    note = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.order.number}: {self.from_status or '—'} → {self.to_status}"


class DesignRequestFile(models.Model):
    """A plain reference file attached to a Design request: not Artwork, no
    Preflight is run on it."""

    design_request = models.ForeignKey(DesignRequest, related_name="files", on_delete=models.CASCADE)
    file = models.FileField(upload_to="design_requests/%Y/%m/%d/")
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.original_filename
