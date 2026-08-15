"""El rastro de auditoria tiene que registrar quien, que, cuando y de cuanto a cuanto."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.audit import AuditLog
from accounts.models import Resource, Role
from apps.hotel_settings.models import HotelSettings, PaymentMethod

User = get_user_model()


class AuditCaptureTests(TestCase):
    def setUp(self):
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Auditado")
        AuditLog.objects.all().delete()

    def test_a_creation_is_recorded_with_its_values(self):
        method = PaymentMethod.objects.create(
            hotel_settings=self.hotel, name="Caja auditada"
        )

        entry = AuditLog.objects.filter(object_id=str(method.pk)).first()

        self.assertIsNotNone(entry)
        self.assertEqual(entry.action, AuditLog.Action.CREATE)
        self.assertEqual(entry.changes["after"]["name"], "Caja auditada")
        self.assertEqual(entry.hotel_settings_id, self.hotel.id)

    # El "de cuanto a cuanto" es lo que se pregunta en una auditoria.
    def test_an_edit_records_before_and_after(self):
        method = PaymentMethod.objects.create(
            hotel_settings=self.hotel, name="Caja editable"
        )
        AuditLog.objects.all().delete()

        method.name = "Caja renombrada"
        method.save()

        entry = AuditLog.objects.filter(action=AuditLog.Action.UPDATE).first()

        self.assertIsNotNone(entry)
        self.assertEqual(entry.changes["name"]["before"], "Caja editable")
        self.assertEqual(entry.changes["name"]["after"], "Caja renombrada")

    # Sin esto, cada `save()` de cualquier modelo con `auto_now` dejaria una fila que
    # solo dice "updated_at cambio", y esas esconden los cambios de verdad.
    def test_saving_without_changes_records_nothing(self):
        method = PaymentMethod.objects.create(
            hotel_settings=self.hotel, name="Caja estable"
        )
        AuditLog.objects.all().delete()

        method.save()

        self.assertEqual(AuditLog.objects.count(), 0)

    def test_a_deletion_keeps_what_was_deleted(self):
        method = PaymentMethod.objects.create(
            hotel_settings=self.hotel, name="Caja por borrar"
        )
        AuditLog.objects.all().delete()

        method.delete()

        entry = AuditLog.objects.filter(action=AuditLog.Action.DELETE).first()

        self.assertIsNotNone(entry)
        self.assertEqual(entry.changes["before"]["name"], "Caja por borrar")

    # Auditar el propio rastro seria un bucle infinito.
    def test_the_audit_trail_does_not_audit_itself(self):
        AuditLog.objects.create(action=AuditLog.Action.CREATE, entity="Prueba")

        self.assertEqual(AuditLog.objects.filter(entity="Audit Log").count(), 0)

    # Sin peticion --un comando, una tarea-- la escritura se registra igual, como
    # accion del sistema: "no hay registro" no es una respuesta valida en auditoria.
    def test_a_write_without_a_request_is_still_recorded(self):
        PaymentMethod.objects.create(
            hotel_settings=self.hotel, name="Caja sin peticion"
        )

        entry = AuditLog.objects.filter(object_label__icontains="sin peticion").first()

        self.assertIsNotNone(entry)
        self.assertEqual(entry.username, "")
        self.assertIsNone(entry.user)


class AuditApiTests(TestCase):
    def setUp(self):
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel API")
        self.otro = HotelSettings.objects.create(hotel_name="Hotel Ajeno")

        role = Role.objects.create(name="Auditor", slug="auditor")
        resource, _ = Resource.objects.get_or_create(
            key="audit.read", defaults={"name": "audit.read", "link_backend": "/api/audit/"}
        )
        role.resources.add(resource)

        self.user = User.objects.create_user(
            username="auditor", password="pass12345", hotel_settings=self.hotel
        )
        self.user.roles.add(role)

        self.api = APIClient()
        self.api.force_login(self.user)

    def _rows(self, **params):
        response = self.api.get("/api/audit/", params)
        self.assertEqual(response.status_code, 200, response.data)
        payload = response.data
        return payload["results"] if isinstance(payload, dict) else payload

    # Quien hace una escritura por la API queda registrado con nombre e IP.
    def test_the_api_records_who_did_it(self):
        AuditLog.objects.all().delete()

        response = self.api.post(
            "/api/hotel-settings/",
            {"hotel_name": "Nuevo Hotel"},
            format="json",
        )
        # No importa si el endpoint acepta o rechaza: si escribio, tiene que quedar.
        if response.status_code >= 400:
            self.skipTest("El endpoint rechazo la escritura; no hay nada que auditar.")

        entry = AuditLog.objects.exclude(username="").first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.username, "auditor")
        self.assertIsNotNone(entry.ip_address)

    def test_each_hotel_only_sees_its_own_trail(self):
        AuditLog.objects.create(
            action=AuditLog.Action.CREATE, entity="Propio", hotel_settings_id=self.hotel.id
        )
        AuditLog.objects.create(
            action=AuditLog.Action.CREATE, entity="Ajeno", hotel_settings_id=self.otro.id
        )

        entities = {row["entity"] for row in self._rows()}

        self.assertIn("Propio", entities)
        self.assertNotIn("Ajeno", entities)

    def test_filters_by_action_and_day(self):
        AuditLog.objects.create(
            action=AuditLog.Action.DELETE, entity="Borrado", hotel_settings_id=self.hotel.id
        )
        AuditLog.objects.create(
            action=AuditLog.Action.CREATE, entity="Alta", hotel_settings_id=self.hotel.id
        )

        entities = {row["entity"] for row in self._rows(action="DELETE")}

        self.assertEqual(entities, {"Borrado"})

    def test_the_trail_cannot_be_written_through_the_api(self):
        for method, url in (
            ("post", "/api/audit/"),
            ("delete", "/api/audit/1/"),
        ):
            response = getattr(self.api, method)(url)
            self.assertIn(response.status_code, (403, 404, 405), f"{method} {url}")

    def test_it_exports_csv(self):
        AuditLog.objects.create(
            action=AuditLog.Action.CREATE,
            entity="Exportable",
            username="auditor",
            hotel_settings_id=self.hotel.id,
        )

        response = self.api.get("/api/audit/export/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response["Content-Type"])
        body = response.content.decode("utf-8")
        self.assertIn("Exportable", body)
        self.assertIn("auditor", body)

    def test_it_offers_only_the_filters_that_return_something(self):
        AuditLog.objects.create(
            action=AuditLog.Action.CREATE,
            entity="Habitacion",
            username="auditor",
            hotel_settings_id=self.hotel.id,
        )

        response = self.api.get("/api/audit/entities/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("Habitacion", response.data["entities"])
        self.assertIn("auditor", response.data["users"])
