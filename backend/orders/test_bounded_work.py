"""A very large (but valid) file never blocks the customer: checks that overrun
their budget give up, and the Artwork is kept with a "not fully checked" Warning."""

import shutil
import tempfile
import time
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from . import preflight, rendering
from .fixtures_pdf import build_f2
from .models import Artwork
from .pdf_utils import run_bounded
from .test_artwork import as_upload, make_product


class RunBoundedTests(TestCase):
    def test_returns_the_result_when_the_job_finishes_in_time(self):
        self.assertEqual(run_bounded(time.sleep, 0, timeout=20), (True, None))

    def test_gives_up_on_a_job_that_overruns_and_the_next_job_still_runs(self):
        self.assertEqual(run_bounded(time.sleep, 30, timeout=0.3), (False, None))
        self.assertEqual(run_bounded(time.sleep, 0, timeout=20), (True, None))


class OverrunningChecksTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root, ARTWORK_UPLOAD_RATE=None)
        override.enable()
        self.addCleanup(override.disable)
        self.client = APIClient()
        self.product = make_product()

    def upload(self):
        return self.client.post(
            "/api/artworks/",
            {"file": as_upload(build_f2()), "slot": "front", "product": self.product.id},
            format="multipart",
        )

    def test_checks_that_overrun_leave_a_not_fully_checked_warning_and_no_block(self):
        with patch.object(preflight, "CHECK_BUDGET_S", 0.0), patch.object(preflight, "OVERRUN_GRACE_S", 0.0):
            res = self.upload()
        self.assertEqual(res.status_code, 201, res.content)
        front = res.json()["front"]
        findings = front["preflight_report"]["findings"]
        self.assertIn("check_incomplete", [f["code"] for f in findings])
        self.assertEqual(front["preflight_report"]["headline_severity"], "warning")
        self.assertTrue(front["is_valid"])
        self.assertEqual(res.json()["errors"], [])

    def test_a_page_image_that_overruns_is_skipped_without_failing_the_upload(self):
        with patch.object(rendering, "RENDER_BUDGET_S", 0.0):
            res = self.upload()
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(res.json()["front"]["is_valid"])
        self.assertEqual(Artwork.objects.count(), 2)
