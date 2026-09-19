from django.core.management.base import BaseCommand

from orders.cleanup import purge_unattached_uploads


class Command(BaseCommand):
    help = (
        "Remove uploads nobody ordered: Artwork not on a submitted Order and Page picker sources, "
        "once they are 24 hours old, along with their files. Artwork on a submitted Order is never "
        "touched. Safe to run twice; run it on a schedule (e.g. hourly) and at startup."
    )

    def handle(self, *args, **options):
        removed = purge_unattached_uploads()
        self.stdout.write(
            f"Removed {removed['artworks']} unattached upload{'' if removed['artworks'] == 1 else 's'} "
            f"and {removed['sources']} page-picker source{'' if removed['sources'] == 1 else 's'}."
        )
