"""Idempotent staff-user creator. Used by seed/bootstrap workflows."""

from __future__ import annotations

import os
import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Create or update a staff user. Idempotent."

    def add_arguments(self, parser):
        parser.add_argument('--username', default=os.getenv('STAFF_USERNAME', 'staff'))
        parser.add_argument('--email', default=os.getenv('STAFF_EMAIL', ''))
        parser.add_argument(
            '--password',
            default=os.getenv('STAFF_PASSWORD', ''),
            help='Plaintext password. If omitted and the user does not yet exist, a random one is printed.',
        )
        parser.add_argument(
            '--superuser',
            action='store_true',
            help='Also grant is_superuser=True (for Django admin access).',
        )

    def handle(self, *args, **opts):
        User = get_user_model()
        username = opts['username']
        password = opts['password']
        generated = False

        defaults = {
            'email': opts['email'] or '',
            'is_staff': True,
            'is_active': True,
        }
        if opts['superuser']:
            defaults['is_superuser'] = True

        user, created = User.objects.get_or_create(username=username, defaults=defaults)
        if not created:
            for field, value in defaults.items():
                setattr(user, field, value)

        if password:
            user.set_password(password)
        elif created:
            password = secrets.token_urlsafe(16)
            user.set_password(password)
            generated = True

        user.save()

        verb = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f"{verb} staff user '{username}'"))
        if generated:
            self.stdout.write(self.style.WARNING(
                f"  generated password: {password}   (shown once — save it now)"
            ))
