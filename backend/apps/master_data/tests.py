from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.master_data.models import RETIRED_GROUPS, MasterData


class RetiredMasterDataGroupsTests(APITestCase):
    """Auditoria, Bloque 3 #1: los grupos que ya no alimentan nada no admiten datos nuevos."""

    def setUp(self):
        self.client.force_login(
            get_user_model().objects.create_superuser(
                username="platform_md", email="platform_md@example.com", password="pass12345"
            )
        )

    def test_retired_groups_are_not_offered(self):
        response = self.client.get("/api/master-data/groups/")

        self.assertEqual(response.status_code, 200)
        codes = {row["code"] for row in response.data}
        self.assertTrue(codes.isdisjoint(RETIRED_GROUPS))
        self.assertIn("DOCUMENT_TYPE", codes)

    def test_new_values_in_a_retired_group_are_rejected(self):
        for group in RETIRED_GROUPS:
            with self.subTest(group=group):
                response = self.client.post(
                    "/api/master-data/",
                    {"group": group, "code": "SUITE", "name": "Suite"},
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
                self.assertFalse(MasterData.objects.filter(group=group, code="SUITE").exists())

    def test_existing_value_of_a_retired_group_can_still_be_deactivated(self):
        legacy = MasterData.objects.create(group="PAYMENT_METHOD", code="CASH", name="Efectivo")

        response = self.client.patch(
            f"/api/master-data/{legacy.id}/", {"is_active": False}, format="json"
        )

        self.assertEqual(response.status_code, 200, response.data)

    def test_active_groups_still_accept_values(self):
        response = self.client.post(
            "/api/master-data/",
            {"group": "DOCUMENT_TYPE", "code": "PAS", "name": "Permiso especial de prueba"},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)

    def test_unknown_group_is_rejected(self):
        # Bloque 3 #3: un typo creaba un grupo huerfano sin error.
        response = self.client.post(
            "/api/master-data/",
            {"group": "PAYMENT_METHODS_TYPO", "code": "X", "name": "X"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("group", response.json().get("errors", {}))


class MasterDataApiTests(APITestCase):
    """Cobertura basica del catalogo que consumen ~12 pantallas (auditoria, Bloque 3 #5)."""

    def setUp(self):
        from accounts.test_helpers import make_hotel_user
        from apps.hotel_settings.test_utils import create_configured_hotel

        hotel = create_configured_hotel(hotel_name="Hotel Catalogo")
        self.reader = make_hotel_user(hotel, "master_data.read")
        self.writer = make_hotel_user(hotel, "master_data.read", "master_data.write")

    def _create(self, code, group="DOCUMENT_TYPE", name="Valor"):
        return self.client.post(
            "/api/master-data/", {"group": group, "code": code, "name": name}, format="json"
        )

    def test_code_is_normalized_to_uppercase(self):
        self.client.force_authenticate(self.writer)
        response = self._create("  doc_prueba_zz ")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["code"], "DOC_PRUEBA_ZZ")

    def test_group_and_code_are_unique(self):
        self.client.force_authenticate(self.writer)
        self.assertEqual(self._create("NIT_ZZ").status_code, 201)
        duplicated = self._create("nit_zz")
        self.assertEqual(duplicated.status_code, 400)

    def test_unknown_group_is_rejected(self):
        self.client.force_authenticate(self.writer)
        self.assertEqual(self._create("X", group="PAYMENT_METHODS").status_code, 400)

    def test_writing_requires_the_write_scope(self):
        self.client.force_authenticate(self.reader)
        self.assertEqual(self._create("CE_ZZ").status_code, 403)
        self.assertEqual(self.client.get("/api/master-data/").status_code, 200)

    def test_filters_by_group(self):
        self.client.force_authenticate(self.writer)
        self._create("TI_ZZ")
        self._create("PRUEBA_ORIGEN", group="RESERVATION_ORIGIN")
        response = self.client.get("/api/master-data/", {"group": "reservation_origin"})
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        self.assertTrue(rows)
        self.assertTrue(all(row["group"] == "RESERVATION_ORIGIN" for row in rows))

    def test_delete_is_logical_and_can_be_restored(self):
        self.client.force_authenticate(self.writer)
        created = self._create("RC_ZZ").data
        self.assertEqual(self.client.delete(f"/api/master-data/{created['id']}/").status_code, 204)
        self.assertEqual(self.client.get(f"/api/master-data/{created['id']}/").status_code, 404)
        # La fila sigue en la base (borrado logico, 5.5).
        self.assertTrue(MasterData.objects.filter(pk=created["id"]).exists())
        restored = self.client.post(f"/api/master-data/{created['id']}/restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(self.client.get(f"/api/master-data/{created['id']}/").status_code, 200)

    # ------------------------------------------------ reordenar y nombres (Bloque 3 #8)

    def test_reorder_sets_the_new_order_for_the_whole_group(self):
        self.client.force_authenticate(self.writer)
        first = self._create("ORD_A", name="Alfa").data["id"]
        second = self._create("ORD_B", name="Beta").data["id"]
        third = self._create("ORD_C", name="Gamma").data["id"]

        response = self.client.post(
            "/api/master-data/reorder/",
            {"group": "DOCUMENT_TYPE", "ids": [third, first, second]},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        orders = dict(MasterData.objects.filter(pk__in=[first, second, third]).values_list("pk", "sort_order"))
        self.assertEqual((orders[third], orders[first], orders[second]), (1, 2, 3))

    def test_reorder_rejects_values_from_another_group(self):
        self.client.force_authenticate(self.writer)
        own = self._create("ORD_D", name="Delta").data["id"]
        foreign = self._create("ORD_ORIGEN", group="RESERVATION_ORIGIN", name="Otro").data["id"]
        response = self.client.post(
            "/api/master-data/reorder/", {"group": "DOCUMENT_TYPE", "ids": [own, foreign]}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_reorder_requires_the_write_scope(self):
        self.client.force_authenticate(self.reader)
        response = self.client.post("/api/master-data/reorder/", {"group": "DOCUMENT_TYPE", "ids": [1]}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_name_is_unique_within_a_group(self):
        self.client.force_authenticate(self.writer)
        self.assertEqual(self._create("NOM_A", name="Carnet").status_code, 201)
        self.assertEqual(self._create("NOM_B", name="carnet ").status_code, 400)
        # En otro grupo el mismo nombre si vale.
        self.assertEqual(self._create("NOM_C", group="RESERVATION_ORIGIN", name="Carnet").status_code, 201)
