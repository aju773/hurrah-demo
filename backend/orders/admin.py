from django.contrib import admin, messages
from django.db import transaction
from django.core.exceptions import PermissionDenied
from django.http import Http404, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.urls import path, reverse
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_POST
from django.utils.html import format_html, format_html_join

from .catalogue import load_catalogue
from .catalogue_views import commerce_enabled
from .catalogue_checks import defaults_problems, describe_combo, missing_base_prices
from .lifecycle import TransitionError, available_transitions, mark_paid, transition_order
from .models import (
    Artwork,
    BasePrice,
    DemoClock,
    DesignRequest,
    DesignRequestFile,
    Option,
    OptionValue,
    Order,
    OrderLine,
    OrderStatusChange,
    Product,
    Restriction,
)

MISSING_PRICE_LIST_LIMIT = 60


class CatalogueRefused(Exception):
    def __init__(self, problems):
        super().__init__("; ".join(p["message"] for p in problems))
        self.problems = problems


class CatalogueGuardMixin:
    """Refuses any admin save or delete that would leave an *active* Product's
    defaults invalid (exactly one default per Option, forming a valid Configuration).
    The change is rolled back with the request's transaction and staff are sent
    back with the reason. Build a new catalogue up under an inactive Product: the
    check runs when it is activated."""

    def product_of(self, obj):
        raise NotImplementedError

    def _check(self, product):
        if product is None or not product.active or not Product.objects.filter(pk=product.pk).exists():
            return
        problems = defaults_problems(load_catalogue(product))
        if problems:
            raise CatalogueRefused(problems)

    def save_related(self, request, form, formsets, change):
        super().save_related(request, form, formsets, change)
        self._check(self.product_of(form.instance))

    def delete_model(self, request, obj):
        product = self.product_of(obj)
        super().delete_model(request, obj)
        self._check(product)

    def delete_queryset(self, request, queryset):
        products = {self.product_of(obj) for obj in queryset}
        with transaction.atomic():
            super().delete_queryset(request, queryset)
            for product in products:
                self._check(product)

    def _refuse(self, request, refused):
        for problem in refused.problems:
            messages.error(request, f"Not saved. {problem['message']}")
        return HttpResponseRedirect(request.get_full_path())

    def changeform_view(self, request, *args, **kwargs):
        try:
            return super().changeform_view(request, *args, **kwargs)
        except CatalogueRefused as refused:
            return self._refuse(request, refused)

    def delete_view(self, request, *args, **kwargs):
        try:
            return super().delete_view(request, *args, **kwargs)
        except CatalogueRefused as refused:
            return self._refuse(request, refused)

    def changelist_view(self, request, *args, **kwargs):
        try:
            return super().changelist_view(request, *args, **kwargs)
        except CatalogueRefused as refused:
            return self._refuse(request, refused)


@admin.register(Product)
class ProductAdmin(CatalogueGuardMixin, admin.ModelAdmin):
    list_display = ["name", "slug", "active", "missing_prices"]
    readonly_fields = ["missing_base_prices_report"]

    def product_of(self, obj):
        return obj

    @admin.display(description="Missing Base prices")
    def missing_prices(self, obj):
        return len(missing_base_prices(load_catalogue(obj)))

    @admin.display(description="Base price completeness")
    def missing_base_prices_report(self, obj):
        if obj is None or obj.pk is None:
            return "Save the Product first."
        catalogue = load_catalogue(obj)
        missing = missing_base_prices(catalogue)
        if not missing:
            return "No missing Base prices."
        shown = missing[:MISSING_PRICE_LIST_LIMIT]
        items = format_html_join("", "<li>{}</li>", ((describe_combo(catalogue, combo),) for combo in shown))
        more = f" (first {MISSING_PRICE_LIST_LIMIT} shown)" if len(missing) > len(shown) else ""
        noun = "Base price" if len(missing) == 1 else "Base prices"
        return format_html("{} missing {}{}<ul>{}</ul>", len(missing), noun, more, items)


@admin.register(Option)
class OptionAdmin(CatalogueGuardMixin, admin.ModelAdmin):
    def product_of(self, obj):
        return obj.product


@admin.register(OptionValue)
class OptionValueAdmin(CatalogueGuardMixin, admin.ModelAdmin):
    def product_of(self, obj):
        return obj.option.product


@admin.register(Restriction)
class RestrictionAdmin(CatalogueGuardMixin, admin.ModelAdmin):
    def product_of(self, obj):
        return obj.value_x.option.product


@admin.register(BasePrice)
class BasePriceAdmin(CatalogueGuardMixin, admin.ModelAdmin):
    def product_of(self, obj):
        return obj.product


admin.site.register(Artwork)


@admin.register(DemoClock)
class DemoClockAdmin(admin.ModelAdmin):
    """DemoClock is a singleton (see its docstring): block adding a second row so a
    presenter editing "now" always changes the one row that `current_time()` reads."""

    def has_add_permission(self, request):
        return not DemoClock.objects.exists()


class DesignRequestFileInline(admin.TabularInline):
    model = DesignRequestFile
    extra = 0
    readonly_fields = ["file", "original_filename", "content_type", "size_bytes", "uploaded_at"]
    can_delete = False


@admin.register(DesignRequest)
class DesignRequestAdmin(admin.ModelAdmin):
    list_display = ["number", "status", "name", "phone", "product", "configuration_line", "brief_preview", "created_at"]
    list_display_links = ["number"]
    list_editable = ["status"]
    list_filter = ["status", "flyer_language", "browsing_language"]
    search_fields = ["number", "name", "phone", "email", "business_name", "brief"]
    readonly_fields = ["number", "created_at", "configuration_line", "browsing_language"]
    inlines = [DesignRequestFileInline]
    fields = [
        "number",
        "status",
        "product",
        "configuration_line",
        "name",
        "phone",
        "email",
        "business_name",
        "brief",
        "flyer_language",
        "browsing_language",
        "created_at",
    ]

    @admin.display(description="Configuration")
    def configuration_line(self, obj):
        if not obj.configuration_snapshot:
            return "Not decided yet"
        return ", ".join(f"{key}: {value}" for key, value in obj.configuration_snapshot.items())

    @admin.display(description="Brief")
    def brief_preview(self, obj):
        return (obj.brief[:60] + "…") if len(obj.brief) > 60 else obj.brief


class OrderStatusChangeInline(admin.TabularInline):
    model = OrderStatusChange
    extra = 0
    readonly_fields = ["from_status", "to_status", "staff_user", "note", "created_at"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


def _aed(fils):
    if fils is None:
        return "—"
    return f"{fils / 100:,.2f} AED"


def _file_url(field):
    return field.url if field else ""


class OrderLineInline(admin.StackedInline):
    """The approved snapshot: everything the customer saw and agreed to, as it
    was at approval time. Read-only."""

    model = OrderLine
    extra = 0
    can_delete = False
    fields = [
        "configuration_summary",
        "quote_summary",
        "size_choice_summary",
        "previews",
        "original_files",
        "preflight_table",
        "accepted_warnings",
        "approved_at",
        "promised",
    ]
    readonly_fields = fields

    def get_fields(self, request, obj=None):
        fields = super().get_fields(request, obj)
        return fields if commerce_enabled() else [f for f in fields if f != "quote_summary"]

    def has_add_permission(self, request, obj=None):
        return False

    @admin.display(description="Configuration")
    def configuration_summary(self, line):
        return format_html_join(
            "", "<div>{}: <strong>{}</strong></div>",
            ((c["name_en"], c["label_en"]) for c in line.configuration_snapshot),
        )

    @admin.display(description="Quote")
    def quote_summary(self, line):
        rows = [("Base price", _aed(line.base_fils))]
        rows += [(f"{u['label_en']} (+{u['percent']:g}%)", _aed(u["fils"])) for u in line.uplifts_snapshot]
        rows += [("Subtotal", _aed(line.subtotal_fils)), ("VAT 5%", _aed(line.vat_fils)), ("Total", _aed(line.total_fils))]
        return format_html_join("", "<div>{}: {}</div>", rows)

    @admin.display(description="Size choice")
    def size_choice_summary(self, line):
        choice = line.size_choice or {}
        rotate = choice.get("rotate") or {}
        turned = [label for label, side in (("Front", "front"), ("Back", "back")) if rotate.get(side)]
        rotate_text = f"Rotated 90° clockwise: {' and '.join(turned)}" if turned else ""
        if choice.get("swap"):
            swap_text = "Swapped: the file uploaded as Back prints as Front and the file uploaded as Front prints as Back"
            rotate_text = f"{swap_text}. {rotate_text}" if rotate_text else swap_text
        if not choice.get("mode"):
            return rotate_text or "Kept at the file's own size"
        mode = str(choice.get("mode", "")).title()
        bits = [f"scale {choice['scale']:.3f}"] if choice.get("scale") is not None else []
        if choice.get("white_border_mm"):
            bits.append(f"white border {choice['white_border_mm']} mm")
        if choice.get("crop_mm"):
            bits.append(f"crop {choice['crop_mm']} mm")
        text = f"{mode}: " + ", ".join(bits) if bits else mode
        return f"{text}. {rotate_text}" if rotate_text else text

    @staticmethod
    def _printed_side(line, uploaded_slot):
        """The side a file prints as: Swap trades the uploaded Front and Back."""
        if (line.size_choice or {}).get("swap") and line.back_artwork is not None and not line.same_as_front:
            return "Back" if uploaded_slot == "front" else "Front"
        return uploaded_slot.title()

    def _artworks(self, line):
        artworks = [(self._printed_side(line, "front"), line.front_artwork)]
        if line.same_as_front:
            artworks.append(("Back", None))
        elif line.back_artwork is not None:
            artworks.append((self._printed_side(line, "back"), line.back_artwork))
        return sorted(artworks, key=lambda pair: pair[0] != "Front")

    @admin.display(description="Previews")
    def previews(self, line):
        cells = []
        for label, artwork in self._artworks(line):
            if artwork is None:
                cells.append(format_html("<div><strong>{}</strong><br>Same as front</div>", label))
                continue
            thumb = _file_url(artwork.thumbnail_image) or _file_url(artwork.page_image)
            full = _file_url(artwork.page_image) or thumb
            if not thumb:
                cells.append(format_html("<div><strong>{}</strong><br>No preview</div>", label))
                continue
            # Natural aspect ratio, so a landscape back next to a portrait front shows as it is.
            cells.append(format_html(
                '<div><strong>{}</strong><br><a href="{}" target="_blank"><img src="{}" alt="{} preview" '
                'style="max-width:220px;max-height:220px;width:auto;height:auto;border:1px solid #ccc"></a></div>',
                label, full, thumb, label,
            ))
        return format_html('<div style="display:flex;gap:24px;align-items:flex-start">{}</div>',
                           format_html_join("", "{}", ((c,) for c in cells)))

    @admin.display(description="Original files")
    def original_files(self, line):
        rows = []
        for label, artwork in self._artworks(line):
            if artwork is None:
                continue
            rows.append((label, _file_url(artwork.file), artwork.original_filename))
        return format_html_join("", '<div>{}: <a href="{}" download>{}</a></div>', rows)

    @admin.display(description="Preflight report")
    def preflight_table(self, line):
        rows = []
        for slot in ("front", "back"):
            report = (line.preflight_report_snapshot or {}).get(slot)
            if not report:
                continue
            if not report.get("findings"):
                rows.append((self._printed_side(line, slot), "ok", "", "", "", "No findings"))
            for f in report.get("findings", []):
                rows.append((self._printed_side(line, slot), f["severity"], f["code"], f.get("value") if f.get("value") is not None else "",
                             f.get("page") or "", f.get("message", "")))
        if not rows:
            return "Not recorded"
        body = format_html_join("", "<tr><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>", rows)
        return format_html(
            "<table><thead><tr><th>Slot</th><th>Severity</th><th>Code</th><th>Value</th><th>Page</th><th>Message</th>"
            "</tr></thead><tbody>{}</tbody></table>", body,
        )

    @admin.display(description="Accepted warnings")
    def accepted_warnings(self, line):
        return ", ".join(line.accepted_warning_codes) or "None"

    @admin.display(description="Promised delivery")
    def promised(self, line):
        window = ""
        if line.promised_window_start and line.promised_window_end:
            window = f", {line.promised_window_start:%H:%M}–{line.promised_window_end:%H:%M}"
        elif line.promised_window_end:
            window = f", by {line.promised_window_end:%H:%M}"
        return f"{line.promised_date:%a %d %b %Y}{window}"


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """Staff view of an Order: a read-only snapshot with only the moves the
    lifecycle allows (orders/lifecycle.py) as buttons, plus Mark paid. Orders are
    created by customers' Submit, never in admin, and never edited or deleted here
    (the `reset_demo` command clears demo data)."""

    change_form_template = "admin/orders/order/change_form.html"
    list_display = [
        "number", "name", "mobile", "status", "turnaround_label", "promised_date", "has_warnings",
    ]
    list_display_links = ["number"]
    list_filter = ["status", "line__turnaround", "browsing_language"]
    search_fields = ["number", "name", "mobile", "token"]
    ordering = ["line__promised_date", "created_at"]
    readonly_fields = [f.name for f in Order._meta.fields if f.name != "id"]
    inlines = [OrderLineInline, OrderStatusChangeInline]

    # Shown only with the Commerce switch on: money, payment and delivery address.
    COMMERCE_LIST_COLUMNS = ["total", "payment_status"]
    COMMERCE_FIELDS = ["area", "address_line", "payment_method", "payment_status"]

    def get_list_display(self, request):
        columns = list(super().get_list_display(request))
        return columns + self.COMMERCE_LIST_COLUMNS if commerce_enabled() else columns

    def get_list_filter(self, request):
        filters = list(super().get_list_filter(request))
        return filters + ["payment_status"] if commerce_enabled() else filters

    def get_fields(self, request, obj=None):
        fields = super().get_fields(request, obj)
        return fields if commerce_enabled() else [f for f in fields if f not in self.COMMERCE_FIELDS]

    def get_queryset(self, request):
        return super().get_queryset(request).select_related("line")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description="Turnaround", ordering="line__turnaround")
    def turnaround_label(self, order):
        line = getattr(order, "line", None)
        if line is None:
            return "—"
        for entry in line.configuration_snapshot:
            if entry.get("option") == "turnaround":
                return entry["label_en"]
        return line.turnaround or "—"

    @admin.display(description="Promised", ordering="line__promised_date")
    def promised_date(self, order):
        line = getattr(order, "line", None)
        return f"{line.promised_date:%d %b %Y}" if line else "—"

    @admin.display(description="Total", ordering="line__total_fils")
    def total(self, order):
        line = getattr(order, "line", None)
        return _aed(line.total_fils) if line else "—"

    @admin.display(description="Warnings", boolean=True)
    def has_warnings(self, order):
        line = getattr(order, "line", None)
        if line is None:
            return False
        for report in (line.preflight_report_snapshot or {}).values():
            if report and any(f["severity"] == "warning" for f in report.get("findings", [])):
                return True
        return False

    def get_urls(self):
        custom = [
            path("<path:object_id>/transition/", self.admin_site.admin_view(self.transition_view),
                 name="orders_order_transition"),
            path("<path:object_id>/mark-paid/", self.admin_site.admin_view(self.mark_paid_view),
                 name="orders_order_mark_paid"),
        ]
        return custom + super().get_urls()

    def change_view(self, request, object_id, form_url="", extra_context=None):
        order = self.get_object(request, object_id)
        extra_context = dict(extra_context or {})
        if order is not None:
            extra_context["can_move"] = request.user.has_perm("orders.change_order")
            extra_context["transitions"] = available_transitions(order.status)
            extra_context["commerce"] = commerce_enabled()
            extra_context["can_mark_paid"] = commerce_enabled() and order.payment_status != "paid"
        return super().change_view(request, object_id, form_url, extra_context)

    def _staff_action(self, request, object_id, action):
        if not request.user.has_perm("orders.change_order"):
            raise PermissionDenied
        order = get_object_or_404(Order, pk=object_id)
        try:
            action(order)
        except TransitionError as error:
            messages.error(request, error.message)
        return HttpResponseRedirect(reverse("admin:orders_order_change", args=[order.pk]))

    @method_decorator(require_POST)
    def transition_view(self, request, object_id):
        def move(order):
            transition_order(order, request.POST.get("transition", ""), request.user.get_username(), request.POST.get("note", ""))
            messages.success(request, f"{order.number} is now {order.get_status_display().lower()}.")
        return self._staff_action(request, object_id, move)

    @method_decorator(require_POST)
    def mark_paid_view(self, request, object_id):
        if not commerce_enabled():
            raise Http404
        def pay(order):
            mark_paid(order, request.user.get_username())
            messages.success(request, f"{order.number} marked paid.")
        return self._staff_action(request, object_id, pay)
