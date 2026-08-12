from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import HotelSettings, PaymentMethod

# Todo hotel cobra en efectivo desde el primer dia. Sin al menos un metodo activo no se
# puede registrar un pago ni cerrar un check-out (ver AGENTS.md 5.16), asi que un hotel
# recien creado quedaria bloqueado hasta que alguien se acordara de configurarlo.
DEFAULT_PAYMENT_METHOD = {
    "code": "EFECTIVO",
    "name": "Efectivo",
    "method_type": PaymentMethod.MethodType.CASH,
}


@receiver(post_save, sender=HotelSettings, dispatch_uid="hotel_settings_default_payment_method")
def create_default_payment_method(sender, instance, created, **kwargs):
    """Siembra el metodo de pago en efectivo al crear un hotel.

    Va en un signal y no en la vista porque los hoteles nacen por varios caminos: el
    panel SaaS, `POST /api/hotel-settings/` y `apps.demo_requests.views.convert_request()`.
    Aqui se cubren todos de una vez.

    `get_or_create` lo hace idempotente: si el hotel ya tiene un metodo con ese codigo
    —por ejemplo al restaurar uno borrado logicamente— no se duplica ni falla contra la
    unicidad `(hotel_settings, code)`.
    """
    if not created:
        return

    PaymentMethod.objects.get_or_create(
        hotel_settings=instance,
        code=DEFAULT_PAYMENT_METHOD["code"],
        defaults={
            "name": DEFAULT_PAYMENT_METHOD["name"],
            "method_type": DEFAULT_PAYMENT_METHOD["method_type"],
            "is_active": True,
        },
    )
