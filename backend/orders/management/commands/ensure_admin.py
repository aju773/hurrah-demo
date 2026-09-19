import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create the admin superuser from ADMIN_USER / ADMIN_PASSWORD if it does not exist."

    def handle(self, *args, **options):
        username = os.environ.get('ADMIN_USER')
        password = os.environ.get('ADMIN_PASSWORD')
        if not username or not password:
            self.stdout.write('ADMIN_USER / ADMIN_PASSWORD not set; skipping admin creation.')
            return

        User = get_user_model()
        if User.objects.filter(username=username).exists():
            self.stdout.write(f'Admin "{username}" already exists.')
            return

        User.objects.create_superuser(username=username, password=password)
        self.stdout.write(f'Created admin "{username}".')
