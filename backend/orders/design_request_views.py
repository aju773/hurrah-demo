import json
import os

from django.conf import settings
from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BROWSING_LANGUAGE_CHOICES, FLYER_LANGUAGE_CHOICES, DesignRequest, DesignRequestFile, Product
from .numbering import allocate_design_request_number
from .serializers import DesignRequestSerializer

MAX_DESIGN_REQUEST_FILES = 3
MAX_DESIGN_REQUEST_FILE_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_DESIGN_REQUEST_EXTENSIONS = {".jpg", ".jpeg", ".png", ".pdf"}


def _required_text(data, field):
    value = (data.get(field) or "").strip()
    return value or None


class DesignRequestCreateView(APIView):
    """POST a Design request as multipart form data: brief fields plus up to
    3 reference files. Files are stored plainly — not Artwork, no Preflight."""

    def post(self, request):
        errors = {}
        codes = {}

        def fail(field, code, message):
            errors[field] = message
            codes[field] = code

        name = _required_text(request.data, "name")
        if not name:
            fail("name", "name_required", "Name is required.")

        phone = _required_text(request.data, "phone")
        if not phone:
            fail("phone", "phone_required", "Phone is required.")

        brief = _required_text(request.data, "brief")
        if not brief:
            fail("brief", "brief_required", "Tell us what the flyer is for and what text to include.")

        flyer_language = request.data.get("flyer_language") or ""
        if flyer_language not in dict(FLYER_LANGUAGE_CHOICES):
            fail("flyer_language", "flyer_language_invalid", "Choose English, Arabic or Both.")

        browsing_language = request.data.get("browsing_language") or "en"
        if browsing_language not in dict(BROWSING_LANGUAGE_CHOICES):
            fail("browsing_language", "browsing_language_invalid", "Unrecognised browsing language.")

        email = (request.data.get("email") or "").strip()
        business_name = (request.data.get("business_name") or "").strip()

        product = None
        product_id = request.data.get("product")
        if product_id:
            try:
                product = Product.objects.filter(pk=int(product_id)).first()
            except (TypeError, ValueError):
                product = None
            if product is None:
                fail("product", "product_unknown", "Unknown product.")

        configuration_snapshot = {}
        configuration_raw = request.data.get("configuration")
        if configuration_raw:
            try:
                parsed = json.loads(configuration_raw)
            except (TypeError, ValueError):
                parsed = None
            if not isinstance(parsed, dict):
                fail("configuration", "configuration_invalid", "Configuration must be a JSON object.")
            else:
                configuration_snapshot = parsed

        files = request.FILES.getlist("files")
        if len(files) > MAX_DESIGN_REQUEST_FILES:
            fail("files", "files_too_many", f"Up to {MAX_DESIGN_REQUEST_FILES} reference files are allowed.")
        else:
            for uploaded_file in files:
                ext = os.path.splitext(uploaded_file.name)[1].lower()
                if ext not in ALLOWED_DESIGN_REQUEST_EXTENSIONS:
                    fail("files", "files_wrong_type", "Reference files must be JPG, PNG or PDF.")
                    break
                if uploaded_file.size > MAX_DESIGN_REQUEST_FILE_SIZE:
                    fail("files", "files_too_large", "Each reference file must be 20MB or smaller.")
                    break

        if errors:
            return Response(
                {"detail": "Please check the form.", "code": "invalid_form", "errors": errors, "error_codes": codes},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # allocate_design_request_number()'s row lock is a no-op on backends (e.g.
        # SQLite) without real SELECT ... FOR UPDATE support, so retry on a
        # duplicate-number race instead of relying on the lock alone.
        design_request = None
        for attempt in range(5):
            try:
                with transaction.atomic():
                    number = allocate_design_request_number()
                    design_request = DesignRequest.objects.create(
                        number=number,
                        product=product,
                        configuration_snapshot=configuration_snapshot,
                        name=name,
                        phone=phone,
                        email=email,
                        business_name=business_name,
                        brief=brief,
                        flyer_language=flyer_language,
                        browsing_language=browsing_language,
                    )
                    for uploaded_file in files:
                        DesignRequestFile.objects.create(
                            design_request=design_request,
                            file=uploaded_file,
                            original_filename=uploaded_file.name,
                            content_type=uploaded_file.content_type or "",
                            size_bytes=uploaded_file.size,
                        )
                break
            except IntegrityError:
                if attempt == 4:
                    raise

        data = DesignRequestSerializer(design_request, context={"request": request}).data
        data["message"] = {
            "code": "design_request_created",
            "message_en": (
                f"Design request {number} received. "
                "We'll WhatsApp you within 2 working hours (Mon–Fri 9:00–18:00)."
            ),
        }
        return Response(data, status=status.HTTP_201_CREATED)


class DesignHelpSettingsView(APIView):
    """GET the placeholder settings the drawer needs before a customer submits
    anything, e.g. the WhatsApp hotline number."""

    def get(self, request):
        return Response({"whatsapp_number": settings.DESIGN_HELP_WHATSAPP_NUMBER})
