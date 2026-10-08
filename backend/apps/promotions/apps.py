from django.apps import AppConfig


class PromotionsConfig(AppConfig):
    name = 'apps.promotions'

    def ready(self):
        from . import signals  # noqa: F401
