from decimal import Decimal

from rest_framework import serializers

from .models import Artwork, DesignRequest, DesignRequestFile, Order, OrderLine, Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "slug",
            "image_url",
            "bleed_mm",
            "safe_mm",
            "size_tolerance_mm",
            "bleed_min_mm",
            "bleed_max_mm",
            "ppi_error_below",
            "ppi_warn_below",
        ]


class ArtworkSerializer(serializers.ModelSerializer):
    matched_size_code = serializers.CharField(source="matched_size.code", read_only=True, default=None)
    matched_size_label = serializers.CharField(source="matched_size.label_en", read_only=True, default=None)

    class Meta:
        model = Artwork
        fields = [
            "id",
            "product",
            "slot",
            "file",
            "original_filename",
            "source_page_count",
            "page_index",
            "matched_size",
            "matched_size_code",
            "matched_size_label",
            "trim_width_mm",
            "trim_height_mm",
            "media_width_mm",
            "media_height_mm",
            "orientation",
            "trim_source",
            "bleed_mm",
            "rotation",
            "is_valid",
            "error_code",
            "error_message",
            "preflight_report",
            "page_image",
            "thumbnail_image",
            "uploaded_at",
        ]
        read_only_fields = [f for f in fields if f not in ("product", "slot", "file")]


class DesignRequestFileSerializer(serializers.ModelSerializer):
    class Meta:
        model = DesignRequestFile
        fields = ["id", "file", "original_filename", "content_type", "size_bytes", "uploaded_at"]
        read_only_fields = fields


def _fils_to_aed(fils):
    return str((Decimal(fils) / 100).quantize(Decimal("0.01")))


class OrderLineSerializer(serializers.ModelSerializer):
    front_thumbnail_url = serializers.SerializerMethodField()
    back_thumbnail_url = serializers.SerializerMethodField()
    base_aed = serializers.SerializerMethodField()
    subtotal_aed = serializers.SerializerMethodField()
    vat_aed = serializers.SerializerMethodField()
    total_aed = serializers.SerializerMethodField()
    uplifts = serializers.SerializerMethodField()

    class Meta:
        model = OrderLine
        fields = [
            "product",
            "configuration_snapshot",
            "base_aed",
            "uplifts",
            "subtotal_aed",
            "vat_aed",
            "total_aed",
            "front_thumbnail_url",
            "back_thumbnail_url",
            "same_as_front",
            "size_choice",
            "preflight_report_snapshot",
            "accepted_warning_codes",
            "approved_at",
            "promised_date",
            "promised_window_start",
            "promised_window_end",
        ]
        read_only_fields = fields

    def _url(self, image_field):
        request = self.context.get("request")
        if not image_field:
            return None
        return request.build_absolute_uri(image_field.url) if request else image_field.url

    def get_front_thumbnail_url(self, obj):
        return self._url(obj.front_artwork.thumbnail_image)

    def get_back_thumbnail_url(self, obj):
        if obj.same_as_front or obj.back_artwork is None:
            return None
        return self._url(obj.back_artwork.thumbnail_image)

    def get_base_aed(self, obj):
        return _fils_to_aed(obj.base_fils)

    def get_subtotal_aed(self, obj):
        return _fils_to_aed(obj.subtotal_fils)

    def get_vat_aed(self, obj):
        return _fils_to_aed(obj.vat_fils)

    def get_total_aed(self, obj):
        return _fils_to_aed(obj.total_fils)

    def get_uplifts(self, obj):
        return [
            {"label_en": u["label_en"], "label_ar": u["label_ar"], "percent": u["percent"], "amount_aed": _fils_to_aed(u["fils"])}
            for u in obj.uplifts_snapshot
        ]


class OrderSerializer(serializers.ModelSerializer):
    line = OrderLineSerializer(read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "number",
            "token",
            "name",
            "mobile",
            "area",
            "address_line",
            "email",
            "company",
            "note",
            "payment_method",
            "payment_status",
            "status",
            "browsing_language",
            "created_at",
            "line",
        ]
        read_only_fields = fields


class DesignRequestSerializer(serializers.ModelSerializer):
    files = DesignRequestFileSerializer(many=True, read_only=True)

    class Meta:
        model = DesignRequest
        fields = [
            "id",
            "number",
            "product",
            "configuration_snapshot",
            "name",
            "phone",
            "email",
            "business_name",
            "brief",
            "flyer_language",
            "browsing_language",
            "status",
            "created_at",
            "files",
        ]
        read_only_fields = fields
