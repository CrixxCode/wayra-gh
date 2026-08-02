from django.core.management import BaseCommand, call_command


TEST_LABELS = [
    "accounts.tests",
    "apps.billing.tests",
    "apps.clients.tests",
    "apps.hotel_settings.tests",
    "apps.packages.tests",
    "apps.reservations.tests",
    "apps.rooms.tests",
    "apps.services.tests",
]


class Command(BaseCommand):
    help = (
        "Run the backend test suite with explicit module labels. "
        "Use this command in CI to avoid accidental discovery of ad-hoc scripts."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--keepdb",
            action="store_true",
            help="Preserve the test database between runs.",
        )
        parser.add_argument(
            "--failfast",
            action="store_true",
            help="Stop on first failure.",
        )

    def handle(self, *args, **options):
        verbosity = int(options.get("verbosity", 1))
        keepdb = bool(options.get("keepdb", False))
        failfast = bool(options.get("failfast", False))

        self.stdout.write(
            self.style.NOTICE(
                "Running CI backend tests with explicit labels:\n"
                + "\n".join(f" - {label}" for label in TEST_LABELS)
            )
        )

        call_command(
            "test",
            *TEST_LABELS,
            verbosity=verbosity,
            keepdb=keepdb,
            failfast=failfast,
            interactive=False,
        )

