import io
import shutil
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import DesignRequest
from .numbering import allocate_design_request_number


class DesignRequestNumberingTests(TestCase):
    def test_first_number_is_dr_0001(self):
        self.assertEqual(allocate_design_request_number(), "DR-0001")

    def test_numbers_increment_from_the_last_created_request(self):
        DesignRequest.objects.create(
            number=allocate_design_request_number(),
            name="Layla",
            phone="+971500000001",
            brief="A flyer for my bakery.",
            flyer_language="en",
        )
        self.assertEqual(allocate_design_request_number(), "DR-0002")

        DesignRequest.objects.create(
            number=allocate_design_request_number(),
            name="Omar",
            phone="+971500000002",
            brief="Something bilingual.",
            flyer_language="both",
        )
        self.assertEqual(allocate_design_request_number(), "DR-0003")


def make_upload(name="logo.png", content=b"fake-bytes", content_type="image/png"):
    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile(name, content, content_type=content_type)


class DesignRequestCreateApiTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media_root)
        self.override.enable()
        self.client = APIClient()
        self.valid_payload = {
            "name": "Layla",
            "phone": "+971500000001",
            "brief": "A flyer for my bakery opening, include our logo and address.",
            "flyer_language": "en",
            "browsing_language": "en",
        }

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def post(self, payload, files=None):
        data = {**payload}
        if files:
            data["files"] = files
        return self.client.post("/api/design-requests/", data, format="multipart")

    def test_valid_create_returns_dr_number_and_message(self):
        res = self.post(self.valid_payload)
        self.assertEqual(res.status_code, 201, res.content)
        data = res.json()
        self.assertEqual(data["number"], "DR-0001")
        self.assertEqual(data["status"], "new")
        self.assertEqual(data["message"]["code"], "design_request_created")
        self.assertIn("DR-0001", data["message"]["message_en"])
        self.assertEqual(DesignRequest.objects.count(), 1)

    def test_configuration_snapshot_defaults_to_empty_when_not_decided(self):
        res = self.post(self.valid_payload)
        self.assertEqual(res.json()["configuration_snapshot"], {})

    def test_configuration_snapshot_is_stored_when_provided(self):
        payload = {**self.valid_payload, "configuration": '{"size": "a5", "paper": "170gsm-gloss"}'}
        res = self.post(payload)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["configuration_snapshot"], {"size": "a5", "paper": "170gsm-gloss"})

    def test_missing_required_fields_rejected(self):
        for missing in ("name", "phone", "brief", "flyer_language"):
            with self.subTest(missing=missing):
                payload = {k: v for k, v in self.valid_payload.items() if k != missing}
                res = self.post(payload)
                self.assertEqual(res.status_code, 400)
                self.assertIn(missing, res.json()["errors"])
        self.assertEqual(DesignRequest.objects.count(), 0)

    def test_optional_fields_are_optional(self):
        res = self.post(self.valid_payload)
        self.assertEqual(res.status_code, 201, res.content)

    def test_up_to_three_files_accepted(self):
        files = [make_upload(f"ref{i}.jpg", content_type="image/jpeg") for i in range(3)]
        res = self.post(self.valid_payload, files=files)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(len(res.json()["files"]), 3)

    def test_fourth_file_is_rejected(self):
        files = [make_upload(f"ref{i}.jpg", content_type="image/jpeg") for i in range(4)]
        res = self.post(self.valid_payload, files=files)
        self.assertEqual(res.status_code, 400)
        self.assertIn("files", res.json()["errors"])
        self.assertEqual(DesignRequest.objects.count(), 0)

    def test_oversized_file_is_rejected(self):
        big = make_upload("big.png", content=b"0" * (20 * 1024 * 1024 + 1), content_type="image/png")
        res = self.post(self.valid_payload, files=[big])
        self.assertEqual(res.status_code, 400)
        self.assertIn("files", res.json()["errors"])
        self.assertEqual(DesignRequest.objects.count(), 0)

    def test_wrong_type_file_is_rejected(self):
        bad = make_upload("brief.docx", content=b"not-an-image", content_type="application/msword")
        res = self.post(self.valid_payload, files=[bad])
        self.assertEqual(res.status_code, 400)
        self.assertIn("files", res.json()["errors"])
        self.assertEqual(DesignRequest.objects.count(), 0)

    def test_errors_carry_codes_the_frontend_can_translate(self):
        res = self.post({**self.valid_payload, "name": "", "brief": ""})
        data = res.json()
        self.assertEqual(data["code"], "invalid_form")
        self.assertEqual(data["error_codes"], {"name": "name_required", "brief": "brief_required"})
        self.assertEqual(set(data["errors"]), {"name", "brief"})  # English fallback text still sent

    def test_file_errors_have_distinct_codes(self):
        four = [make_upload(f"ref{i}.jpg", content_type="image/jpeg") for i in range(4)]
        self.assertEqual(self.post(self.valid_payload, files=four).json()["error_codes"]["files"], "files_too_many")
        bad = make_upload("brief.docx", content=b"x", content_type="application/msword")
        self.assertEqual(self.post(self.valid_payload, files=[bad]).json()["error_codes"]["files"], "files_wrong_type")
        big = make_upload("big.png", content=b"0" * (20 * 1024 * 1024 + 1), content_type="image/png")
        self.assertEqual(self.post(self.valid_payload, files=[big]).json()["error_codes"]["files"], "files_too_large")

    def test_arabic_browsing_language_is_stored(self):
        res = self.post({**self.valid_payload, "browsing_language": "ar"})
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()["browsing_language"], "ar")
        self.assertEqual(DesignRequest.objects.get().browsing_language, "ar")

    def test_non_numeric_product_id_rejected_not_500(self):
        payload = {**self.valid_payload, "product": "not-an-id"}
        res = self.post(payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn("product", res.json()["errors"])

    def test_dr_numbering_increments_across_requests(self):
        first = self.post(self.valid_payload).json()
        second = self.post(self.valid_payload).json()
        third = self.post(self.valid_payload).json()
        self.assertEqual([first["number"], second["number"], third["number"]], ["DR-0001", "DR-0002", "DR-0003"])
