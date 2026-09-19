from pathlib import Path

from django.core.management.base import BaseCommand

from orders.fixtures_pdf import build_f1, build_f2, build_f3, build_f4

FIXTURES = {
    "f1-layla-a4-no-bleed.pdf": build_f1,
    "f2-omar-a5-clean.pdf": build_f2,
    "f3-password-protected.pdf": build_f3,
    "f4-damaged-repairable.pdf": build_f4,
}


class Command(BaseCommand):
    help = (
        "Write the demo fixture PDFs (F1 Layla's A4 file with warnings, F2 Omar's clean 2-page A5 file, "
        "F3 a password-protected file, F4 a damaged but repairable file) to a folder, for scripted demo runs and browser tests."
    )

    def add_arguments(self, parser):
        parser.add_argument("--out", required=True, help="Folder to write the PDFs into (created if missing).")

    def handle(self, *args, **options):
        out = Path(options["out"])
        out.mkdir(parents=True, exist_ok=True)
        for name, build in FIXTURES.items():
            (out / name).write_bytes(build().read())
            self.stdout.write(f"Wrote {out / name}")
