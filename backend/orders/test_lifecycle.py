"""Order lifecycle (ticket 11): the one place that decides which status moves are
allowed, plus the staff admin that drives it and the demo reset command."""

from datetime import date, datetime, time
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse

from .clock import DUBAI_TZ
from .lifecycle import TransitionError, available_transitions, mark_paid, transition_order
from .models import (
    Artwork,
    DesignRequest,
    Order,
    OrderLine,
    OrderStatusChange,
    Product,
    ORDER_STATUS_CANCELLED,
    ORDER_STATUS_DELIVERED,
    ORDER_STATUS_IN_PRODUCTION,
    ORDER_STATUS_ON_HOLD,
    ORDER_STATUS_OUT_FOR_DELIVERY,
    ORDER_STATUS_STAFF_CHECK,
)
from .numbering import allocate_design_request_number, allocate_order_number

ALL_STATUSES = [
    ORDER_STATUS_STAFF_CHECK,
    ORDER_STATUS_IN_PRODUCTION,
    ORDER_STATUS_ON_HOLD,
    ORDER_STATUS_CANCELLED,
    ORDER_STATUS_OUT_FOR_DELIVERY,
    ORDER_STATUS_DELIVERED,
]


def make_order(status=ORDER_STATUS_STAFF_CHECK, *, number=None, turnaround="standard", promised=date(2026, 9, 24),
               warnings=("bleed_missing",), name="Layla"):
    """An Order + OrderLine built straight through the ORM (Submit is covered in
    test_orders.py). Artwork rows only need to exist; nothing here reads the files."""
    product = Product.objects.get(slug="flyers")
    front = Artwork.objects.create(
        product=product, slot="front", file="uploads/front.pdf", original_filename="front.pdf",
        thumbnail_image="renders/front-thumb.png", page_image="renders/front.png",
    )
    order = Order.objects.create(
        number=number or allocate_order_number(), name=name, mobile="+971501234567", area="Downtown",
        address_line="12 Sheikh Zayed Rd", status=status, idempotency_key=f"key-{Order.objects.count()}-{number}",
    )
    findings = [
        {"code": code, "severity": "warning", "value": 0.0, "slot": "front", "page": 1, "message": f"{code} message"}
        for code in warnings
    ]
    OrderLine.objects.create(
        order=order, product=product, turnaround=turnaround,
        configuration_snapshot=[
            {"option": "size", "name_en": "Size", "name_ar": "", "value": "a5", "label_en": "A5", "label_ar": ""},
            {"option": "turnaround", "name_en": "Turnaround", "name_ar": "", "value": turnaround,
             "label_en": turnaround.title(), "label_ar": ""},
        ],
        base_fils=23500, subtotal_fils=23500, vat_fils=1175, total_fils=24675, uplifts_snapshot=[],
        front_artwork=front, same_as_front=True,
        preflight_report_snapshot={
            "front": {"findings": findings, "headline_severity": "warning" if findings else "ok"}, "back": None,
        },
        accepted_warning_codes=list(warnings),
        approved_at=datetime(2026, 9, 21, 10, 0, tzinfo=DUBAI_TZ), promised_date=promised,
        promised_window_end=time(17, 0),
    )
    OrderStatusChange.objects.create(order=order, from_status="", to_status=status)
    return order


class AvailableTransitionsTests(TestCase):
    def test_moves_offered_from_each_status(self):
        offered = {status: sorted(t.key for t in available_transitions(status)) for status in ALL_STATUSES}
        self.assertEqual(offered, {
            ORDER_STATUS_STAFF_CHECK: ["hold", "pass"],
            ORDER_STATUS_ON_HOLD: ["cancel", "resume"],
            ORDER_STATUS_IN_PRODUCTION: ["out_for_delivery"],
            ORDER_STATUS_OUT_FOR_DELIVERY: ["delivered"],
            ORDER_STATUS_CANCELLED: [],
            ORDER_STATUS_DELIVERED: [],
        })

    def test_only_hold_and_cancel_need_a_note(self):
        needs_note = {t.key for s in ALL_STATUSES for t in available_transitions(s) if t.note_required}
        self.assertEqual(needs_note, {"hold", "cancel"})


class TransitionOrderTests(TestCase):
    def test_each_allowed_move_updates_status_and_logs_a_row(self):
        cases = [
            (ORDER_STATUS_STAFF_CHECK, "pass", "", ORDER_STATUS_IN_PRODUCTION),
            (ORDER_STATUS_STAFF_CHECK, "hold", "Logo looks soft", ORDER_STATUS_ON_HOLD),
            (ORDER_STATUS_ON_HOLD, "resume", "", ORDER_STATUS_IN_PRODUCTION),
            (ORDER_STATUS_ON_HOLD, "cancel", "Customer withdrew", ORDER_STATUS_CANCELLED),
            (ORDER_STATUS_IN_PRODUCTION, "out_for_delivery", "", ORDER_STATUS_OUT_FOR_DELIVERY),
            (ORDER_STATUS_OUT_FOR_DELIVERY, "delivered", "", ORDER_STATUS_DELIVERED),
        ]
        for start, key, note, expected in cases:
            with self.subTest(key=key):
                order = make_order(start)
                change = transition_order(order, key, "sara", note)
                order.refresh_from_db()
                self.assertEqual(order.status, expected)
                self.assertEqual(
                    (change.from_status, change.to_status, change.staff_user, change.note),
                    (start, expected, "sara", note),
                )
                self.assertEqual(order.status_changes.last().pk, change.pk)
                self.assertEqual(order.status_changes.count(), 2)  # creation row + this move

    def test_moves_not_in_the_table_are_refused_and_change_nothing(self):
        refused = [
            (ORDER_STATUS_STAFF_CHECK, "delivered"),
            (ORDER_STATUS_STAFF_CHECK, "cancel"),
            (ORDER_STATUS_STAFF_CHECK, "resume"),
            (ORDER_STATUS_IN_PRODUCTION, "pass"),
            (ORDER_STATUS_IN_PRODUCTION, "cancel"),
            (ORDER_STATUS_IN_PRODUCTION, "hold"),
            (ORDER_STATUS_ON_HOLD, "delivered"),
            (ORDER_STATUS_OUT_FOR_DELIVERY, "cancel"),
            (ORDER_STATUS_CANCELLED, "resume"),
            (ORDER_STATUS_DELIVERED, "out_for_delivery"),
        ]
        for start, key in refused:
            with self.subTest(start=start, key=key):
                order = make_order(start)
                with self.assertRaises(TransitionError) as caught:
                    transition_order(order, key, "sara", "because")
                self.assertEqual(caught.exception.code, "not_allowed")
                order.refresh_from_db()
                self.assertEqual(order.status, start)
                self.assertEqual(order.status_changes.count(), 1)

    def test_unknown_transition_key_is_refused(self):
        with self.assertRaises(TransitionError) as caught:
            transition_order(make_order(), "explode", "sara")
        self.assertEqual(caught.exception.code, "unknown_transition")

    def test_hold_needs_a_note(self):
        for note in ("", "   "):
            order = make_order(ORDER_STATUS_STAFF_CHECK)
            with self.assertRaises(TransitionError) as caught:
                transition_order(order, "hold", "sara", note)
            self.assertEqual(caught.exception.code, "note_required")
            order.refresh_from_db()
            self.assertEqual(order.status, ORDER_STATUS_STAFF_CHECK)

    def test_cancel_needs_a_reason(self):
        order = make_order(ORDER_STATUS_ON_HOLD)
        with self.assertRaises(TransitionError) as caught:
            transition_order(order, "cancel", "sara", "")
        self.assertEqual(caught.exception.code, "note_required")

    def test_stale_order_object_cannot_double_move(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        stale = Order.objects.get(pk=order.pk)
        transition_order(order, "pass", "sara")
        with self.assertRaises(TransitionError):
            transition_order(stale, "hold", "ali", "too late")
        order.refresh_from_db()
        self.assertEqual(order.status, ORDER_STATUS_IN_PRODUCTION)


class MarkPaidTests(TestCase):
    def test_sets_payment_status_and_leaves_order_status_alone(self):
        for start in ALL_STATUSES:
            with self.subTest(start=start):
                order = make_order(start)
                mark_paid(order, "sara")
                order.refresh_from_db()
                self.assertEqual(order.payment_status, "paid")
                self.assertEqual(order.status, start)
                self.assertEqual(order.status_changes.count(), 1)

    def test_paying_twice_is_refused(self):
        order = make_order()
        mark_paid(order, "sara")
        with self.assertRaises(TransitionError) as caught:
            mark_paid(order, "sara")
        self.assertEqual(caught.exception.code, "already_paid")

    def test_status_moves_do_not_touch_payment_status(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        transition_order(order, "pass", "sara")
        order.refresh_from_db()
        self.assertEqual(order.payment_status, "unpaid")


class AdminBase(TestCase):
    def setUp(self):
        self.staff = get_user_model().objects.create_superuser("sara", "s@example.com", "pw")
        self.client.force_login(self.staff)

    def change_url(self, order):
        return reverse("admin:orders_order_change", args=[order.pk])

    def transition_url(self, order):
        return reverse("admin:orders_order_transition", args=[order.pk])

    def paid_url(self, order):
        return reverse("admin:orders_order_mark_paid", args=[order.pk])


class OrderAdminTransitionTests(AdminBase):
    def test_only_allowed_buttons_are_shown(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        html = self.client.get(self.change_url(order)).content.decode()
        self.assertIn('value="pass"', html)
        self.assertIn('value="hold"', html)
        for hidden in ("resume", "cancel", "out_for_delivery", "delivered"):
            self.assertNotIn(f'value="{hidden}"', html)

    def test_finished_orders_have_no_transition_buttons(self):
        html = self.client.get(self.change_url(make_order(ORDER_STATUS_DELIVERED))).content.decode()
        for key in ("pass", "hold", "resume", "cancel", "out_for_delivery", "delivered"):
            self.assertNotIn(f'value="{key}"', html)

    def test_posting_a_move_logs_the_staff_user_and_note(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        response = self.client.post(self.transition_url(order), {"transition": "hold", "note": "Logo soft"}, follow=True)
        order.refresh_from_db()
        self.assertEqual(order.status, ORDER_STATUS_ON_HOLD)
        change = order.status_changes.last()
        self.assertEqual((change.staff_user, change.note, change.to_status), ("sara", "Logo soft", ORDER_STATUS_ON_HOLD))
        self.assertContains(response, "Logo soft")  # shown inline on the Order

    def test_missing_note_shows_an_error_and_changes_nothing(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        response = self.client.post(self.transition_url(order), {"transition": "hold", "note": ""}, follow=True)
        order.refresh_from_db()
        self.assertEqual(order.status, ORDER_STATUS_STAFF_CHECK)
        self.assertContains(response, "note is required")

    def test_disallowed_move_shows_an_error_and_changes_nothing(self):
        order = make_order(ORDER_STATUS_IN_PRODUCTION)
        response = self.client.post(self.transition_url(order), {"transition": "cancel", "note": "x"}, follow=True)
        order.refresh_from_db()
        self.assertEqual(order.status, ORDER_STATUS_IN_PRODUCTION)
        self.assertContains(response, "not allowed")

    def test_transition_view_is_post_only_and_staff_only(self):
        order = make_order()
        self.assertEqual(self.client.get(self.transition_url(order)).status_code, 405)
        self.client.logout()
        response = self.client.post(self.transition_url(order), {"transition": "pass"})
        self.assertEqual(response.status_code, 302)
        order.refresh_from_db()
        self.assertEqual(order.status, ORDER_STATUS_STAFF_CHECK)

    @override_settings(COMMERCE_ENABLED=True)
    def test_mark_paid_button_sets_payment_only(self):
        order = make_order(ORDER_STATUS_IN_PRODUCTION)
        html = self.client.get(self.change_url(order)).content.decode()
        self.assertIn(self.paid_url(order), html)
        self.client.post(self.paid_url(order), follow=True)
        order.refresh_from_db()
        self.assertEqual((order.payment_status, order.status), ("paid", ORDER_STATUS_IN_PRODUCTION))
        html = self.client.get(self.change_url(order)).content.decode()
        self.assertNotIn(self.paid_url(order), html)

    def test_token_api_shows_the_new_status(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        self.client.post(self.transition_url(order), {"transition": "pass"})
        data = self.client.get(f"/api/orders/{order.token}/").json()
        self.assertEqual(data["status"], ORDER_STATUS_IN_PRODUCTION)
        self.assertIn("In production", data["status_message"])


class OrderAdminListTests(AdminBase):
    def setUp(self):
        super().setUp()
        self.late = make_order(ORDER_STATUS_IN_PRODUCTION, number="HUR-10001", turnaround="standard",
                               promised=date(2026, 9, 25), warnings=(), name="Late one")
        self.early = make_order(ORDER_STATUS_STAFF_CHECK, number="HUR-10002", turnaround="express",
                                promised=date(2026, 9, 22), name="Early one")

    def list_response(self, params=None):
        return self.client.get(reverse("admin:orders_order_changelist"), params or {})

    @override_settings(COMMERCE_ENABLED=True)
    def test_columns_show_turnaround_promised_total_and_warnings_flag(self):
        response = self.list_response()
        self.assertContains(response, "Express")
        self.assertContains(response, "246.75")
        self.assertContains(response, "22 Sep 2026")
        rows = {row.number: row for row in response.context["cl"].result_list}
        admin_obj = response.context["cl"].model_admin
        self.assertTrue(admin_obj.has_warnings(rows["HUR-10002"]))
        self.assertFalse(admin_obj.has_warnings(rows["HUR-10001"]))

    def test_sorted_by_promised_date_soonest_first(self):
        numbers = [o.number for o in self.list_response().context["cl"].result_list]
        self.assertEqual(numbers, ["HUR-10002", "HUR-10001"])

    def test_filter_by_status(self):
        result = self.list_response({"status__exact": ORDER_STATUS_STAFF_CHECK}).context["cl"].result_list
        self.assertEqual([o.number for o in result], ["HUR-10002"])

    def test_filter_by_turnaround(self):
        result = self.list_response({"line__turnaround": "standard"}).context["cl"].result_list
        self.assertEqual([o.number for o in result], ["HUR-10001"])


class OrderAdminDetailTests(AdminBase):
    @override_settings(COMMERCE_ENABLED=True)
    def test_detail_is_a_read_only_snapshot_with_previews_files_and_findings(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        response = self.client.get(self.change_url(order))
        self.assertContains(response, "renders/front-thumb.png")  # preview image
        self.assertContains(response, "uploads/front.pdf")  # original file download
        self.assertContains(response, "bleed_missing")  # preflight report table
        self.assertContains(response, "Accepted warnings")
        self.assertContains(response, "Layla")
        self.assertContains(response, "Downtown")
        self.assertContains(response, "Size")
        self.assertContains(response, "A5")

    def test_order_fields_cannot_be_edited(self):
        order = make_order()
        self.client.post(self.change_url(order), {"name": "Changed", "status": ORDER_STATUS_DELIVERED})
        order.refresh_from_db()
        self.assertEqual((order.name, order.status), ("Layla", ORDER_STATUS_STAFF_CHECK))


MONEY_WORDS = ("Payment", "Total", "Quote", "VAT", "Mark paid", "AED", "246.75", "Address", "Area",
               "Downtown", "Sheikh Zayed")


class OrderAdminMoneyFreeTests(AdminBase):
    """Commerce switch off (the default): staff see the Order as the customer
    experienced it, with no money, payment or delivery-address field or action."""

    def setUp(self):
        super().setUp()
        self.order = make_order(ORDER_STATUS_STAFF_CHECK, number="HUR-10001", warnings=("bleed_missing",))
        make_order(ORDER_STATUS_IN_PRODUCTION, number="HUR-10002", warnings=(), name="Clean one")

    def list_html(self):
        return self.client.get(reverse("admin:orders_order_changelist")).content.decode()

    def test_list_has_no_money_or_payment_column_or_filter(self):
        response = self.client.get(reverse("admin:orders_order_changelist"))
        html = response.content.decode()
        for word in ("Total", "Payment", "246.75", "AED"):
            self.assertNotIn(word, html)
        for word in ("HUR-10001", "Layla", "+971501234567", "Staff check", "Standard", "24 Sep 2026", "Warnings"):
            self.assertIn(word, html)

    def test_list_still_flags_orders_with_warnings(self):
        response = self.client.get(reverse("admin:orders_order_changelist"))
        rows = {row.number: row for row in response.context["cl"].result_list}
        admin_obj = response.context["cl"].model_admin
        self.assertTrue(admin_obj.has_warnings(rows["HUR-10001"]))
        self.assertFalse(admin_obj.has_warnings(rows["HUR-10002"]))

    def test_detail_has_no_money_payment_or_address(self):
        html = self.client.get(self.change_url(self.order)).content.decode()
        for word in MONEY_WORDS:
            self.assertNotIn(word, html)
        self.assertNotIn(self.paid_url(self.order), html)

    def test_detail_keeps_snapshot_contact_files_and_history(self):
        response = self.client.get(self.change_url(self.order))
        self.assertContains(response, "Layla")
        self.assertContains(response, "+971501234567")
        self.assertContains(response, "A5")  # Configuration
        self.assertContains(response, "renders/front-thumb.png")  # Front preview
        self.assertContains(response, "bleed_missing")  # Preflight report
        self.assertContains(response, "Accepted warnings")
        self.assertContains(response, "uploads/front.pdf")  # original file

    def test_mark_paid_endpoint_refuses_with_the_switch_off(self):
        response = self.client.post(self.paid_url(self.order))
        self.assertEqual(response.status_code, 404)
        self.order.refresh_from_db()
        self.assertEqual(self.order.payment_status, "unpaid")

    def test_every_allowed_move_still_works_and_customer_sees_it(self):
        for key, note, expected in [("hold", "Logo soft", ORDER_STATUS_ON_HOLD), ("resume", "", ORDER_STATUS_IN_PRODUCTION),
                                    ("out_for_delivery", "", ORDER_STATUS_OUT_FOR_DELIVERY),
                                    ("delivered", "", ORDER_STATUS_DELIVERED)]:
            self.client.post(self.transition_url(self.order), {"transition": key, "note": note})
            self.order.refresh_from_db()
            self.assertEqual(self.order.status, expected)
            self.assertEqual(self.client.get(f"/api/orders/{self.order.token}/").json()["status"], expected)
        self.assertEqual(self.order.status_changes.count(), 5)  # created + four moves


@override_settings(COMMERCE_ENABLED=True)
class OrderAdminMoneyOnTests(AdminBase):
    def test_earlier_money_fields_and_mark_paid_are_back(self):
        order = make_order(ORDER_STATUS_STAFF_CHECK)
        list_html = self.client.get(reverse("admin:orders_order_changelist")).content.decode()
        for word in ("Total", "Payment status", "246.75"):
            self.assertIn(word, list_html)
        detail = self.client.get(self.change_url(order)).content.decode()
        for word in ("Payment", "Quote", "VAT 5%", "Downtown", "Sheikh Zayed", self.paid_url(order)):
            self.assertIn(word, detail)


class ResetDemoCommandTests(TestCase):
    def run_reset(self, *args):
        out = StringIO()
        call_command("reset_demo", *args, stdout=out)
        return out.getvalue()

    def test_clears_orders_lines_status_changes_and_design_requests(self):
        make_order()
        make_order(ORDER_STATUS_IN_PRODUCTION)
        DesignRequest.objects.create(
            number=allocate_design_request_number(), name="Omar", phone="+971500000000", brief="Poster",
            flyer_language="en",
        )
        self.run_reset("--noinput")
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(OrderLine.objects.count(), 0)
        self.assertEqual(OrderStatusChange.objects.count(), 0)
        self.assertEqual(DesignRequest.objects.count(), 0)

    def test_numbering_restarts_at_hur_10001_and_dr_0001(self):
        make_order()
        make_order()
        self.run_reset("--noinput")
        self.assertEqual(allocate_order_number(), "HUR-10001")
        self.assertEqual(allocate_design_request_number(), "DR-0001")

    def test_leaves_the_catalogue_alone(self):
        make_order()
        self.run_reset("--noinput")
        self.assertTrue(Product.objects.filter(slug="flyers").exists())

    def test_asks_for_confirmation_without_noinput(self):
        make_order()
        from unittest.mock import patch
        with patch("builtins.input", return_value="no"):
            self.run_reset()
        self.assertEqual(Order.objects.count(), 1)
        with patch("builtins.input", return_value="yes"):
            self.run_reset()
        self.assertEqual(Order.objects.count(), 0)

    def test_reports_what_it_removed(self):
        make_order()
        self.assertIn("1 order", self.run_reset("--noinput"))
