from django.core.management.base import BaseCommand
from django.db import transaction

from orders.cleanup import purge_unattached_uploads
from orders.models import DesignRequest, DesignRequestFile, Order, OrderLine, OrderStatusChange


class Command(BaseCommand):
    """Return the demo to a clean state in one command:

        python manage.py reset_demo          (asks first; --noinput skips the question)

    The demo clock is not touched. It is the "Demo clock" setting in the admin (one
    row, `fixed_at`); for the demo, set it to a Tuesday at 09:30 Dubai time so the
    Same-day cut-off always lets Same-day through. Leave it empty to use real time.
    """

    help = (
        "Clear demo data before a run: Orders, their lines and status changes, Design requests "
        "(with their reference files), and every upload (Artwork, page-picker sources and their "
        "files). Order numbering restarts at HUR-10001 and Design requests at DR-0001. The catalogue "
        "and the demo clock setting (Admin > Demo clock: fix it to a Tuesday 09:30 Dubai so "
        "Same-day always works) are left alone."
    )

    def add_arguments(self, parser):
        parser.add_argument("--noinput", "--no-input", action="store_true", dest="noinput",
                            help="Do not ask for confirmation.")

    def handle(self, *args, **options):
        orders = Order.objects.count()
        requests = DesignRequest.objects.count()

        if not options["noinput"]:
            answer = input(
                f"This deletes {orders} order(s), {requests} design request(s) and all uploads. Type 'yes' to continue: "
            )
            if answer.strip().lower() != "yes":
                self.stdout.write("Cancelled. Nothing was deleted.")
                return

        with transaction.atomic():
            # Reference files are separate rows; drop the stored files with them.
            for reference in DesignRequestFile.objects.all():
                reference.file.delete(save=False)
            DesignRequest.objects.all().delete()
            # Lines and status changes cascade from the Order; deleted explicitly
            # so the counts below don't depend on that.
            OrderStatusChange.objects.all().delete()
            OrderLine.objects.all().delete()
            Order.objects.all().delete()

        # No Order is left, so every remaining upload is unattached.
        uploads = purge_unattached_uploads(everything=True)

        self.stdout.write(
            f"Removed {orders} order{'' if orders == 1 else 's'}, "
            f"{requests} design request{'' if requests == 1 else 's'}, "
            f"{uploads['artworks']} upload{'' if uploads['artworks'] == 1 else 's'} and "
            f"{uploads['sources']} page-picker source{'' if uploads['sources'] == 1 else 's'}. "
            "Numbering restarts at HUR-10001 / DR-0001."
        )
