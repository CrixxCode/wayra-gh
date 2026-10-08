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
            {"group": "DOCUMENT_TYPE", "code": "PAS", "name": "Pasaporte"},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
