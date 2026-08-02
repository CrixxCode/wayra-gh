from django.urls import reverse
from rest_framework.test import APITestCase, APIClient
from django.contrib.auth import get_user_model
from accounts.models import JobTitle, Role, Resource, UserRole
from apps.hotel_settings.models import HotelSettings

User = get_user_model()

class FilterOrderingTests(APITestCase):
    def setUp(self):
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Filter")

        # Crear rol/recursos y usuarios
        self.r_read = Resource.objects.create(key="users.read", name="Leer usuarios")
        role = Role.objects.create(name="Manager", slug="manager")
        role.resources.add(self.r_read)

        self.u1 = User.objects.create_user(
            username="ana",
            email="ana@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )
        self.u2 = User.objects.create_user(
            username="beto",
            email="beto@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )
        self.u1.roles.add(role); self.u2.roles.add(role)

        # Autenticar vía sesión (bypaséando login view para test)
        self.client = APIClient()
        self.client.force_login(self.u1)

    def test_search_and_order(self):
        url = "/api/users/?search=et&ordering=-username"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        payload = r.data["results"] if isinstance(r.data, dict) and "results" in r.data else r.data
        usernames = [u["username"] for u in payload]
        self.assertTrue("beto" in usernames or "ana" in usernames)

    def test_filter_by_role_slug(self):
        url = "/api/users/?roles__slug=manager"
        r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        if isinstance(r.data, dict) and "count" in r.data:
            self.assertGreaterEqual(r.data["count"], 2)
        else:
            self.assertGreaterEqual(len(r.data), 2)


class RoleTenantIsolationTests(APITestCase):
    def setUp(self):
        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A")
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B")

        self.roles_write_resource = Resource.objects.create(
            key="roles.write",
            name="Roles Write",
            link_backend="/api/roles/",
        )
        self.roles_read_resource = Resource.objects.create(
            key="roles.read",
            name="Roles Read",
            link_backend="/api/roles/",
        )
        manager_role = Role.objects.create(name="Role Manager", slug="role-manager")
        manager_role.resources.add(self.roles_write_resource, self.roles_read_resource)
        self.manager_slug_role = Role.objects.create(name="Manager", slug="manager")
        self.manager_slug_role.resources.add(self.roles_write_resource, self.roles_read_resource)

        self.manager = User.objects.create_user(
            username="manager_a",
            email="manager_a@example.com",
            password="pass12345",
            hotel_settings=self.hotel_a,
        )
        self.manager.roles.add(manager_role)

        self.manager_superuser = User.objects.create_superuser(
            username="manager_superuser",
            email="manager_superuser@example.com",
            password="pass12345",
        )
        self.manager_superuser.hotel_settings = self.hotel_a
        self.manager_superuser.save(update_fields=["hotel_settings"])
        self.manager_superuser.roles.add(self.manager_slug_role)

        self.user_a = User.objects.create_user(
            username="user_a",
            email="user_a@example.com",
            password="pass12345",
            hotel_settings=self.hotel_a,
        )
        self.user_b = User.objects.create_user(
            username="user_b",
            email="user_b@example.com",
            password="pass12345",
            hotel_settings=self.hotel_b,
        )

        self.target_role = Role.objects.create(name="Front Desk", slug="front-desk")

        self.client = APIClient()
        self.client.force_login(self.manager)

    def test_assign_users_rejects_cross_tenant_ids(self):
        url = f"/api/roles/{self.target_role.id}/assign-users/"
        response = self.client.post(
            url,
            {"user_ids": [str(self.user_a.id), str(self.user_b.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("rejected_user_ids", response.data)
        self.assertIn(str(self.user_b.id), response.data["rejected_user_ids"])

    def test_users_catalog_returns_only_authenticated_user_tenant(self):
        response = self.client.get("/api/roles/users-catalog/")
        self.assertEqual(response.status_code, 200)

        returned_ids = {entry["id"] for entry in response.data}
        self.assertIn(str(self.manager.id), returned_ids)
        self.assertIn(str(self.user_a.id), returned_ids)
        self.assertNotIn(str(self.user_b.id), returned_ids)

    def test_users_catalog_limits_superuser_when_user_has_manager_role(self):
        self.client.force_login(self.manager_superuser)
        response = self.client.get("/api/roles/users-catalog/")
        self.assertEqual(response.status_code, 200)

        returned_ids = {entry["id"] for entry in response.data}
        self.assertIn(str(self.manager_superuser.id), returned_ids)
        self.assertIn(str(self.manager.id), returned_ids)
        self.assertIn(str(self.user_a.id), returned_ids)
        self.assertNotIn(str(self.user_b.id), returned_ids)


class ScopeAliasPermissionTests(APITestCase):
    def setUp(self):
        self.client = APIClient()

    def _login_user_with_resource_keys(self, keys: list[str]):
        resources = []
        for key in keys:
            resources.append(
                Resource.objects.create(
                    key=key,
                    name=key,
                    link_backend="/api/hotel-settings/",
                )
            )

        role = Role.objects.create(name="Settings Role", slug="settings-role")
        role.resources.add(*resources)

        user = User.objects.create_user(
            username="settings_user",
            email="settings_user@example.com",
            password="pass12345",
        )
        user.roles.add(role)
        self.client.force_login(user)

    def test_create_hotel_settings_accepts_hyphenated_scope_alias(self):
        self._login_user_with_resource_keys(["hotel-settings.write"])

        response = self.client.post(
            "/api/hotel-settings/",
            {"hotel_name": "Hotel Alias"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get("hotel_name"), "Hotel Alias")

    def test_create_hotel_settings_accepts_resource_wildcard_scope(self):
        self._login_user_with_resource_keys(["hotel-settings.*"])

        response = self.client.post(
            "/api/hotel-settings/",
            {"hotel_name": "Hotel Wildcard"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data.get("hotel_name"), "Hotel Wildcard")

    def test_create_hotel_settings_without_write_scope_is_forbidden(self):
        self._login_user_with_resource_keys(["hotel-settings.read"])

        response = self.client.post(
            "/api/hotel-settings/",
            {"hotel_name": "Hotel Forbidden"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)


class ForcedPasswordChangeTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Password")

        users_read = Resource.objects.create(
            key="users.read",
            name="Users Read",
            link_backend="/api/users/",
        )
        users_write = Resource.objects.create(
            key="users.write",
            name="Users Write",
            link_backend="/api/users/",
        )

        role = Role.objects.create(name="Security Role", slug="security-role")
        role.resources.add(users_read, users_write)

        self.user = User.objects.create_user(
            username="forced_user",
            email="forced_user@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
            must_change_password=True,
        )
        self.user.roles.add(role)

        self.admin_user = User.objects.create_user(
            username="creator_user",
            email="creator_user@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )
        self.admin_user.roles.add(role)

    def test_restricted_endpoints_are_blocked_until_password_is_changed(self):
        self.client.force_login(self.user)

        blocked = self.client.get("/api/users/")
        self.assertEqual(blocked.status_code, 403)
        blocked_payload = getattr(blocked, "data", None) or blocked.json()
        self.assertEqual(blocked_payload.get("code"), "password_change_required")

        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)

    def test_password_change_clears_must_change_password_flag(self):
        self.client.force_login(self.user)

        change_response = self.client.post(
            "/api/auth/password/change/",
            {"old_password": "pass12345", "new_password": "Newpass123!"},
            format="json",
        )

        self.assertEqual(change_response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.must_change_password)
        self.assertIsNotNone(self.user.password_changed_at)

        unblocked = self.client.get("/api/users/")
        self.assertEqual(unblocked.status_code, 200)

    def test_users_created_by_authenticated_actor_require_password_change(self):
        self.client.force_login(self.admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "first_name": "Nuevo",
                "last_name": "Usuario",
                "username": "nuevo_usuario",
                "email": "nuevo_usuario@example.com",
                "job_title": "Recepcionista",
                "password": "Pass12345!",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data.get("must_change_password"))


class UserHotelAssignmentByRoleTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.hotel_a = HotelSettings.objects.create(hotel_name="Hotel A Assignment")
        self.hotel_b = HotelSettings.objects.create(hotel_name="Hotel B Assignment")

        users_read = Resource.objects.create(
            key="users.read",
            name="Users Read Assignment",
            link_backend="/api/users/",
        )
        users_write = Resource.objects.create(
            key="users.write",
            name="Users Write Assignment",
            link_backend="/api/users/",
        )

        self.admin_role = Role.objects.create(name="Administrador", slug="admin")
        self.admin_role.resources.add(users_read, users_write)

        self.operator_role = Role.objects.create(name="Operador", slug="operator")
        self.operator_role.resources.add(users_read, users_write)
        self.reception_role = Role.objects.create(name="Recepcion", slug="reception")
        self.reception_role.resources.add(users_read, users_write)

        self.reception_title = JobTitle.objects.create(
            role=self.reception_role,
            name="Recepcionista",
            slug="recepcionista",
            is_active=True,
        )

        self.admin_user = User.objects.create_user(
            username="tenant_admin",
            email="tenant_admin@example.com",
            password="pass12345",
            hotel_settings=self.hotel_a,
        )
        self.admin_user.roles.add(self.admin_role)

        self.operator_user = User.objects.create_user(
            username="tenant_operator",
            email="tenant_operator@example.com",
            password="pass12345",
            hotel_settings=self.hotel_a,
        )
        self.operator_user.roles.add(self.operator_role)

        self.target_user = User.objects.create_user(
            username="target_user",
            email="target_user@example.com",
            password="pass12345",
            hotel_settings=self.hotel_a,
            first_name="Target",
            last_name="User",
        )
        self.target_user.roles.add(self.operator_role)

    def test_admin_role_can_assign_target_hotel_on_user_create(self):
        self.client.force_login(self.admin_user)

        response = self.client.post(
            "/api/users/",
            {
                "first_name": "User",
                "last_name": "Cross Hotel",
                "username": "user_cross_hotel",
                "email": "user_cross_hotel@example.com",
                "password": "Pass12345!",
                "hotel_settings": self.hotel_b.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["hotel_settings"]["id"], self.hotel_b.id)

    def test_non_admin_role_keeps_actor_hotel_on_user_create(self):
        self.client.force_login(self.operator_user)

        response = self.client.post(
            "/api/users/",
            {
                "first_name": "User",
                "last_name": "Tenant Bound",
                "username": "user_tenant_bound",
                "email": "user_tenant_bound@example.com",
                "password": "Pass12345!",
                "hotel_settings": self.hotel_b.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["hotel_settings"]["id"], self.hotel_a.id)

    def test_admin_role_can_update_user_with_create_fields(self):
        self.client.force_login(self.admin_user)

        response = self.client.patch(
            f"/api/users/{self.target_user.id}/",
            {
                "first_name": "Editado",
                "last_name": "Usuario",
                "username": "target_user_editado",
                "email": "target_user_editado@example.com",
                "role": str(self.reception_role.id),
                "job_title_option": str(self.reception_title.id),
                "hotel_settings": self.hotel_b.id,
                "is_active": False,
                "avatar": "https://example.com/avatar.jpg",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.target_user.refresh_from_db()

        self.assertEqual(self.target_user.first_name, "Editado")
        self.assertEqual(self.target_user.username, "target_user_editado")
        self.assertEqual(self.target_user.email, "target_user_editado@example.com")
        self.assertEqual(self.target_user.job_title, "Recepcionista")
        self.assertEqual(self.target_user.hotel_settings_id, self.hotel_b.id)
        self.assertFalse(self.target_user.is_active)
        self.assertTrue(self.target_user.check_password("pass12345"))
        self.assertFalse(self.target_user.must_change_password)

        self.assertTrue(
            UserRole.objects.filter(
                user=self.target_user,
                role=self.reception_role,
                is_active=True,
            ).exists()
        )
        self.assertFalse(
            UserRole.objects.filter(
                user=self.target_user,
                role=self.operator_role,
                is_active=True,
            ).exists()
        )

    def test_non_admin_role_cannot_move_user_to_other_hotel_on_update(self):
        self.client.force_login(self.operator_user)

        response = self.client.patch(
            f"/api/users/{self.target_user.id}/",
            {
                "hotel_settings": self.hotel_b.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.hotel_settings_id, self.hotel_a.id)

    def test_user_update_rejects_password_changes(self):
        self.client.force_login(self.admin_user)

        response = self.client.patch(
            f"/api/users/{self.target_user.id}/",
            {
                "password": "NewPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data.get("errors", {}))

        self.target_user.refresh_from_db()
        self.assertTrue(self.target_user.check_password("pass12345"))


class SessionLoginFirstAccessTests(APITestCase):
    def setUp(self):
        self.login_url = "/api/auth/login/"
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Login")
        self.user = User.objects.create_user(
            username="first_login_user",
            email="first_login_user@example.com",
            password="Pass12345!",
            hotel_settings=self.hotel,
        )

    def test_login_returns_first_access_flag(self):
        first_response = self.client.post(
            self.login_url,
            {"username": "first_login_user", "password": "Pass12345!"},
            format="json",
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertTrue(first_response.data.get("is_first_login"))

        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)

        second_client = APIClient()
        second_response = second_client.post(
            self.login_url,
            {"username": "first_login_user", "password": "Pass12345!"},
            format="json",
        )

        self.assertEqual(second_response.status_code, 200)
        self.assertFalse(second_response.data.get("is_first_login"))
