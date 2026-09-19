from django.core.management.base import BaseCommand
from django.db import transaction

from orders.models import DesignRequest, DesignRequestFile, Order, OrderLine, OrderStatusChange


class Command(BaseCommand):
    help = (
        "Clear demo data before a run: Orders, their lines and status changes, and Design requests "
        "(with their reference files). Order numbering restarts at HUR-10001 and Design requests at "
        "DR-0001. The catalogue is left alone."
    )

    def add_arguments(self, parser):
        parser.add_argument("--noinput", "--no-input", action="store_true", dest="noinput",
                            help="Do not ask for confirmation.")

    def handle(self, *args, **options):
        orders = Order.objects.count()
        requests = DesignRequest.objects.count()

        if not options["noinput"]:
            answer = input(
                f"This deletes {orders} order(s) and {requests} design request(s). Type 'yes' to continue: "
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

        self.stdout.write(
            f"Removed {orders} order{'' if orders == 1 else 's'} and "
            f"{requests} design request{'' if requests == 1 else 's'}. "
            "Numbering restarts at HUR-10001 / DR-0001."
        )
