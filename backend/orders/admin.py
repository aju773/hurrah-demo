from django.contrib import admin

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

admin.site.register(Product)
admin.site.register(Artwork)
admin.site.register(Option)
admin.site.register(OptionValue)
admin.site.register(Restriction)
admin.site.register(BasePrice)


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


class OrderLineInline(admin.StackedInline):
    model = OrderLine
    extra = 0
    can_delete = False
    readonly_fields = [f.name for f in OrderLine._meta.fields if f.name not in ("id", "order")]


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """Read-only for now — the transition buttons and Mark paid live in
    ticket 11 (staff admin and order lifecycle)."""

    list_display = ["number", "status", "name", "mobile", "payment_status", "created_at"]
    list_display_links = ["number"]
    list_filter = ["status", "payment_status", "browsing_language"]
    search_fields = ["number", "name", "mobile", "token"]
    readonly_fields = [f.name for f in Order._meta.fields if f.name != "id"]
    inlines = [OrderLineInline, OrderStatusChangeInline]
