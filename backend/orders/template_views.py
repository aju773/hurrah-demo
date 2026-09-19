from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework.response import Response
from rest_framework.views import APIView

from . import artwork_templates
from .models import Product


class ArtworkTemplateListView(APIView):
    """GET the Artwork templates the Product offers: one per active Size, plus the
    Product's own thresholds that the "How to prepare your file" guide is written
    from, so the guide's numbers cannot drift from what Preflight checks.

    Query param: locale=en|ar picks each Size's label (English when it has no Arabic).
    """

    def get(self, request, slug):
        product = get_object_or_404(Product, slug=slug, active=True)
        arabic = request.query_params.get("locale") == "ar"
        return Response({
            "templates": [
                {
                    "size_code": size.code,
                    "label": size.label_ar if arabic and size.label_ar else size.label_en,
                    "width_mm": size.width_mm,
                    "height_mm": size.height_mm,
                    "url": request.build_absolute_uri(reverse("artwork-template-download", args=[product.slug, size.code])),
                }
                for size in artwork_templates.active_sizes(product)
            ],
            "guide": {
                "bleed_mm": product.bleed_mm,
                "safe_mm": product.safe_mm,
                "ppi_error_below": product.ppi_error_below,
                "ppi_warn_below": product.ppi_warn_below,
            },
        })


class ArtworkTemplateDownloadView(APIView):
    """GET one Size's Artwork template as a PDF attachment (orders/artwork_templates.py)."""

    def get(self, request, slug, size_code):
        product = get_object_or_404(Product, slug=slug, active=True)
        size = next((s for s in artwork_templates.active_sizes(product) if s.code == size_code), None)
        if size is None:
            return Response({"detail": "No template for that size."}, status=404)
        response = HttpResponse(artwork_templates.template_pdf(product, size), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{artwork_templates.template_filename(product, size)}"'
        return response
