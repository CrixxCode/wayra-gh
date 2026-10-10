from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import get_resolver, reverse
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory, APITestCase, APIClient
from accounts.email_utils import build_wayra_logo_context
from apps.hotel_settings.test_utils import create_configured_hotel
from django.contrib.auth import get_user_model
from accounts.models import JobTitle, Role, Resource, UserRole
from accounts.serializers import UserSerializer
from apps.hotel_settings.models import HotelSettings

User = get_user_model()


class PublicJobTitleCatalogTests(APITestCase):
    def test_public_job_titles_returns_active_titles_without_authentication(self):
        admin_role = Role.objects.create(name="Administrador", slug="admin")
        manager_role = Role.objects.create(name="Gerente", slug="manager")
        active_title = JobTitle.objects.create(
            role=admin_role,
            name="Administrador general",
            slug="administrador-general",
            is_active=True,
            sort_order=1,
        )
        JobTitle.objects.create(
            role=admin_role,
            name="Cargo inactivo",
            slug="cargo-inactivo",
            is_active=False,
            sort_order=2,
        )
        JobTitle.objects.create(
            role=manager_role,
            name="Gerente general",
            slug="gerente-general",
            is_active=True,
            sort_order=1,
        )

        response = self.client.get("/api/roles/public-job-titles/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], str(active_title.id))
        self.assertEqual(response.data[0]["name"], "Administrador general")
        self.assertEqual(response.data[0]["role_id"], str(admin_role.id))


class FilterOrderingTests(APITestCase):
    def setUp(self):
        self.hotel = create_configured_hotel(hotel_name="Hotel Filter")

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
        self.hotel_a = create_configured_hotel(hotel_name="Hotel A")
        self.hotel_b = create_configured_hotel(hotel_name="Hotel B")

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

        self.platform_admin = User.objects.create_superuser(
            username="platform_role_admin",
            email="platform_role_admin@example.com",
            password="pass12345",
        )

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

    def test_platform_admin_users_catalog_ignores_selected_hotel_context(self):
        self.client.force_login(self.platform_admin)

        response = self.client.get(f"/api/roles/users-catalog/?hotel_settings={self.hotel_a.id}")
        self.assertEqual(response.status_code, 200)

        returned_ids = {entry["id"] for entry in response.data}
        self.assertIn(str(self.user_a.id), returned_ids)
        self.assertIn(str(self.user_b.id), returned_ids)

    def test_platform_admin_role_users_ignores_selected_hotel_context(self):
        self.user_a.roles.add(self.target_role)
        self.user_b.roles.add(self.target_role)
        self.client.force_login(self.platform_admin)

        response = self.client.get(
            f"/api/roles/{self.target_role.id}/users/?hotel_settings={self.hotel_a.id}"
        )
        self.assertEqual(response.status_code, 200)

        returned_ids = {entry["id"] for entry in response.data}
        self.assertIn(str(self.user_a.id), returned_ids)
        self.assertIn(str(self.user_b.id), returned_ids)


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
        self.hotel = create_configured_hotel(hotel_name="Hotel Password")

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


class HotelInactiveBlockTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Bloqueado")

        self.hotel_user = User.objects.create_user(
            username="hotel_user",
            email="hotel_user@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )

        self.global_admin = User.objects.create_superuser(
            username="global_admin",
            email="global_admin@example.com",
            password="pass12345",
        )
        self.global_admin.hotel_settings = None
        self.global_admin.save()

    def test_login_is_rejected_for_deactivated_hotel(self):
        self.hotel.is_active = False
        self.hotel.save()

        self.client.get("/api/auth/csrf/")
        response = self.client.post(
            "/api/auth/login/",
            {"username": "hotel_user", "password": "pass12345"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data.get("code"), "hotel_inactive")

    def test_existing_session_is_blocked_once_hotel_is_deactivated(self):
        self.client.force_login(self.hotel_user)

        still_active = self.client.get("/api/auth/me/")
        self.assertEqual(still_active.status_code, 200)

        self.hotel.is_active = False
        self.hotel.save()

        # /api/auth/me/ stays reachable so the frontend can read hotel_settings.is_active,
        # but any other endpoint must be blocked.
        blocked = self.client.get("/api/users/")
        self.assertEqual(blocked.status_code, 403)
        blocked_payload = getattr(blocked, "data", None) or blocked.json()
        self.assertEqual(blocked_payload.get("code"), "hotel_inactive")

        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        self.assertFalse(me.data["hotel_settings"]["is_active"])

    def test_global_admin_without_hotel_is_never_blocked(self):
        self.hotel.is_active = False
        self.hotel.save()

        self.client.force_login(self.global_admin)

        response = self.client.get("/api/users/")
        self.assertNotEqual(response.status_code, 403)

    def test_reactivating_the_hotel_unblocks_the_session(self):
        self.client.force_login(self.hotel_user)

        self.hotel.is_active = False
        self.hotel.save()
        blocked = self.client.get("/api/users/")
        self.assertEqual(blocked.status_code, 403)
        blocked_payload = getattr(blocked, "data", None) or blocked.json()
        self.assertEqual(blocked_payload.get("code"), "hotel_inactive")

        self.hotel.is_active = True
        self.hotel.save()
        unblocked = self.client.get("/api/users/")
        if unblocked.status_code == 403:
            unblocked_payload = getattr(unblocked, "data", None) or unblocked.json()
            self.assertNotEqual(unblocked_payload.get("code"), "hotel_inactive")


class HotelBrandColorSharedViaMeTests(APITestCase):
    """Los colores de marca viven en `HotelSettings`, no en el navegador (ver
    AGENTS.md 5.4): cualquier usuario del hotel debe verlos igual por `/api/auth/me/`,
    sin necesitar el scope `hotel_settings.read`."""

    def setUp(self):
        self.client = APIClient()
        self.hotel = HotelSettings.objects.create(
            hotel_name="Hotel Colores",
            primary_color="#123456",
            secondary_color="#abcdef",
        )
        self.other_hotel = HotelSettings.objects.create(
            hotel_name="Otro Hotel",
            primary_color="#000000",
            secondary_color="#111111",
        )

        # Sin roles asignados a proposito: ver el color de marca no depende de RBAC.
        self.receptionist = User.objects.create_user(
            username="receptionist",
            email="receptionist@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )
        self.housekeeper = User.objects.create_user(
            username="housekeeper",
            email="housekeeper@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )
        self.other_hotel_user = User.objects.create_user(
            username="other_hotel_user",
            email="other_hotel_user@example.com",
            password="pass12345",
            hotel_settings=self.other_hotel,
        )

    def test_every_user_of_the_hotel_sees_the_same_brand_colors(self):
        self.client.force_login(self.receptionist)
        receptionist_me = self.client.get("/api/auth/me/")

        self.client.force_login(self.housekeeper)
        housekeeper_me = self.client.get("/api/auth/me/")

        for response in (receptionist_me, housekeeper_me):
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["hotel_settings"]["primary_color"], "#123456")
            self.assertEqual(response.data["hotel_settings"]["secondary_color"], "#abcdef")

    def test_a_different_hotel_keeps_its_own_colors(self):
        self.client.force_login(self.other_hotel_user)
        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["hotel_settings"]["primary_color"], "#000000")
        self.assertEqual(response.data["hotel_settings"]["secondary_color"], "#111111")


class WayraLogoContextTests(TestCase):
    def test_uses_frontend_dist_logo_when_source_public_logo_is_not_available(self):
        with TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            backend_base_dir = project_root / "backend"
            dist_logo_path = project_root / "frontend_dist" / "logo.png"
            dist_logo_path.parent.mkdir(parents=True)
            dist_logo_path.write_bytes(b"fake-logo")

            with override_settings(
                BASE_DIR=backend_base_dir,
                FRONTEND_DIST_DIR=project_root / "frontend_dist",
                BRAND_LOGO_URL="",
            ):
                logo_url, inline_logo_bytes, inline_logo_name, inline_logo_cid = (
                    build_wayra_logo_context()
                )

        self.assertEqual(logo_url, "cid:platform-logo")
        self.assertEqual(inline_logo_bytes, b"fake-logo")
        self.assertEqual(inline_logo_name, "logo.png")
        self.assertEqual(inline_logo_cid, "platform-logo")


class UserHotelAssignmentByRoleTests(APITestCase):
    def setUp(self):
        self.client = APIClient()
        self.hotel_a = create_configured_hotel(hotel_name="Hotel A Assignment")
        self.hotel_b = create_configured_hotel(hotel_name="Hotel B Assignment")

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

        self.manager_role = Role.objects.create(name="Gerente", slug="manager")
        self.manager_role.resources.add(users_read, users_write)
        self.operator_role = Role.objects.create(name="Operador", slug="operator")
        self.operator_role.resources.add(users_read, users_write)
        self.reception_role = Role.objects.create(name="Recepcion", slug="staff")
        self.reception_role.resources.add(users_read, users_write)
        self.platform_role = Role.objects.create(
            name="Administrador de plataforma",
            slug="platform_admin",
        )
        self.platform_role.resources.add(users_read, users_write)

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

        self.other_hotel_user = User.objects.create_user(
            username="other_hotel_user_assignment",
            email="other_hotel_user_assignment@example.com",
            password="pass12345",
            hotel_settings=self.hotel_b,
        )
        self.platform_admin = User.objects.create_superuser(
            username="platform_users_admin",
            email="platform_users_admin@example.com",
            password="pass12345",
        )

    def test_admin_role_keeps_actor_hotel_on_user_create(self):
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
        self.assertEqual(response.data["hotel_settings"]["id"], self.hotel_a.id)

    def test_hotel_user_list_is_scoped_to_actor_hotel(self):
        self.client.force_login(self.admin_user)

        response = self.client.get("/api/users/")

        self.assertEqual(response.status_code, 200)
        payload = (
            response.data["results"]
            if isinstance(response.data, dict) and "results" in response.data
            else response.data
        )
        returned_ids = {entry["id"] for entry in payload}
        self.assertIn(str(self.admin_user.id), returned_ids)
        self.assertIn(str(self.target_user.id), returned_ids)
        self.assertNotIn(str(self.other_hotel_user.id), returned_ids)

    def test_platform_user_list_scope_global_ignores_selected_hotel_filter(self):
        self.client.force_login(self.platform_admin)

        response = self.client.get(f"/api/users/?scope=global&hotel_settings={self.hotel_a.id}")

        self.assertEqual(response.status_code, 200)
        payload = (
            response.data["results"]
            if isinstance(response.data, dict) and "results" in response.data
            else response.data
        )
        returned_ids = {entry["id"] for entry in payload}
        self.assertIn(str(self.admin_user.id), returned_ids)
        self.assertIn(str(self.other_hotel_user.id), returned_ids)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="Wayra <no-reply@example.com>",
        APP_DISPLAY_NAME="Wayra",
    )
    def test_platform_admin_can_send_direct_email_to_user(self):
        self.client.force_login(self.platform_admin)

        response = self.client.post(
            f"/api/users/{self.target_user.id}/send-email/",
            {
                "subject": "Aviso de cuenta",
                "message": "Linea uno del mensaje.\nLinea dos del mensaje.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["sent"])
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, [self.target_user.email])
        self.assertEqual(message.subject, "Aviso de cuenta")
        self.assertEqual(message.reply_to, [self.platform_admin.email])
        self.assertIn("Linea uno del mensaje.", message.body)
        self.assertEqual(len(message.alternatives), 1)
        self.assertIn("Mensaje de plataforma", message.alternatives[0][0])
        self.assertIn("cid:platform-logo", message.alternatives[0][0])

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        DEFAULT_FROM_EMAIL="Wayra <no-reply@example.com>",
    )
    def test_platform_admin_direct_email_ignores_selected_hotel_context(self):
        self.client.force_login(self.platform_admin)

        response = self.client.post(
            f"/api/users/{self.target_user.id}/send-email/?hotel_settings={self.hotel_b.id}",
            {"subject": "Aviso de cuenta", "message": "Mensaje"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["sent"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.target_user.email])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_hotel_user_cannot_send_direct_email_from_user_detail(self):
        self.client.force_login(self.admin_user)

        response = self.client.post(
            f"/api/users/{self.target_user.id}/send-email/",
            {"subject": "Aviso", "message": "Mensaje"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(len(mail.outbox), 0)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_direct_email_requires_recipient_email(self):
        self.client.force_login(self.platform_admin)
        self.target_user.email = ""
        self.target_user.save(update_fields=["email"])

        response = self.client.post(
            f"/api/users/{self.target_user.id}/send-email/",
            {"subject": "Aviso", "message": "Mensaje"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data.get("errors", {}))
        self.assertEqual(len(mail.outbox), 0)

    def test_hotel_user_role_assignments_expose_only_hotel_management_roles(self):
        self.client.force_login(self.admin_user)

        response = self.client.get(f"/api/users/{self.target_user.id}/roles/")

        self.assertEqual(response.status_code, 200)
        slugs = {role["slug"] for role in response.data["roles"]}
        self.assertEqual(slugs, {"admin", "manager", "operator", "staff"})
        self.assertIn(str(self.operator_role.id), response.data["active_role_ids"])
        self.assertNotIn(str(self.platform_role.id), response.data["active_role_ids"])

    def test_hotel_user_role_assignments_can_toggle_multiple_roles(self):
        self.client.force_login(self.admin_user)

        response = self.client.post(
            f"/api/users/{self.target_user.id}/roles/",
            {
                "role_ids": [
                    str(self.admin_role.id),
                    str(self.operator_role.id),
                    str(self.reception_role.id),
                ]
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        active_slugs = set(
            Role.objects.filter(
                userrole__user=self.target_user,
                userrole__is_active=True,
            ).values_list("slug", flat=True)
        )
        self.assertEqual(active_slugs, {"admin", "staff", "operator"})

        response = self.client.post(
            f"/api/users/{self.target_user.id}/roles/",
            {"role_ids": [str(self.operator_role.id), str(self.reception_role.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        active_slugs = set(
            Role.objects.filter(
                userrole__user=self.target_user,
                userrole__is_active=True,
            ).values_list("slug", flat=True)
        )
        self.assertEqual(active_slugs, {"staff", "operator"})

    def test_hotel_user_role_assignments_reject_platform_only_roles(self):
        self.client.force_login(self.admin_user)

        response = self.client.post(
            f"/api/users/{self.target_user.id}/roles/",
            {"role_ids": [str(self.platform_role.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn(str(self.platform_role.id), response.data["rejected_role_ids"])

    def test_platform_admin_sees_only_hotel_roles_when_managing_hotel_user_roles(self):
        self.client.force_login(self.platform_admin)

        response = self.client.get(f"/api/users/{self.target_user.id}/roles/?scope=global")

        self.assertEqual(response.status_code, 200)
        slugs = {role["slug"] for role in response.data["roles"]}
        self.assertEqual(slugs, {"admin", "manager", "operator", "staff"})
        self.assertNotIn(str(self.platform_role.id), response.data["active_role_ids"])

    def test_platform_admin_cannot_assign_platform_role_to_hotel_user(self):
        self.client.force_login(self.platform_admin)

        response = self.client.post(
            f"/api/users/{self.target_user.id}/roles/?scope=global",
            {"role_ids": [str(self.platform_role.id)]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn(str(self.platform_role.id), response.data["rejected_role_ids"])
        self.assertFalse(
            UserRole.objects.filter(
                user=self.target_user,
                role=self.platform_role,
                is_active=True,
            ).exists()
        )

    def test_platform_admin_role_catalog_can_be_forced_to_hotel_context(self):
        self.client.force_login(self.platform_admin)

        response = self.client.get("/api/roles/?assign_context=hotel")

        self.assertEqual(response.status_code, 200)
        payload = (
            response.data["results"]
            if isinstance(response.data, dict) and "results" in response.data
            else response.data
        )
        slugs = {role["slug"] for role in payload}
        self.assertEqual(slugs, {"admin", "manager", "operator", "staff"})

    def test_platform_admin_cannot_update_hotel_user_to_platform_role_without_job_title(self):
        self.client.force_login(self.platform_admin)

        response = self.client.patch(
            f"/api/users/{self.target_user.id}/?scope=global",
            {"role": str(self.platform_role.id)},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.data.get("errors", {}))
        self.assertFalse(
            UserRole.objects.filter(
                user=self.target_user,
                role=self.platform_role,
                is_active=True,
            ).exists()
        )

    def test_platform_admin_cannot_create_hotel_user_with_platform_role(self):
        self.client.force_login(self.platform_admin)

        response = self.client.post(
            "/api/users/",
            {
                "first_name": "Hotel",
                "last_name": "Platform Role",
                "username": "hotel_platform_role",
                "email": "hotel_platform_role@example.com",
                "password": "Pass12345!",
                "hotel_settings": self.hotel_a.id,
                "role": str(self.platform_role.id),
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("role", response.data.get("errors", {}))
        self.assertFalse(User.objects.filter(username="hotel_platform_role").exists())

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

    def test_admin_role_can_update_user_with_create_fields_without_moving_hotel(self):
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
        self.assertEqual(self.target_user.hotel_settings_id, self.hotel_a.id)
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
        self.hotel = create_configured_hotel(hotel_name="Hotel Login")
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


# Metodo HTTP -> accion DRF equivalente. Varios `get_required_scopes()` deciden por
# `self.action` y no solo por `request.method` (ver apps/billing/views.py::PaymentViewSet).
_SCOPE_PROBE_ACTIONS = {
    "get": "list",
    "post": "create",
    "put": "update",
    "patch": "partial_update",
    "delete": "destroy",
}


def _collect_declared_scopes():
    """Todos los scopes que las vistas registradas pueden llegar a exigir.

    Se recorre el resolver de URLs y se interroga a cada vista en vez de mantener una
    lista fija, para que un ViewSet nuevo con un scope nuevo haga fallar esta prueba
    hasta que el scope se agregue a `seed_rbac`.
    """
    factory = APIRequestFactory()
    scopes: set[str] = set()

    def probe(view_class):
        declared = set(getattr(view_class, "required_scopes", None) or [])

        for method, action in _SCOPE_PROBE_ACTIONS.items():
            if not callable(getattr(view_class, "get_required_scopes", None)):
                break
            view = view_class()
            view.action = action
            view.format_kwarg = None
            view.kwargs = {}
            view.request = Request(getattr(factory, method)("/?include_deleted=true"))
            try:
                declared.update(view.get_required_scopes() or [])
            except Exception:
                # Una vista que necesita mas contexto del que se puede simular aporta,
                # al menos, su `required_scopes` de clase.
                continue

        # `HasResourcePermission` solo agrega `<scope>_deleted` si la vista sabe resolver
        # `include_deleted` --lo que aporta `LogicalDeleteViewSetMixin`--. Darlo por hecho
        # para toda lectura exigia sembrar permisos que no existen: la auditoria, por
        # ejemplo, no tiene borrado logico que consultar.
        supports_deleted = callable(getattr(view_class, "_should_include_deleted", None))

        for scope in declared:
            if not isinstance(scope, str) or not scope:
                continue
            scopes.add(scope)
            if supports_deleted and scope.endswith(".read"):
                scopes.add(f"{scope}_deleted")

    def walk(patterns):
        for entry in patterns:
            nested = getattr(entry, "url_patterns", None)
            if nested is not None:
                walk(nested)
                continue

            view_class = getattr(entry.callback, "cls", None)
            if view_class is not None and getattr(view_class, "required_scopes", None):
                probe(view_class)

    walk(get_resolver().url_patterns)
    return scopes


class SeedRbacCoverageTests(TestCase):
    """El seed debe dejar operativo un hotel nuevo sin parches manuales.

    `apps/demo_requests/views.py::convert_request()` asigna el rol `admin` al primer
    usuario de cada hotel convertido, y `permissionChildGuard` solo autoriza rutas
    presentes en el menu del usuario. Si el seed no cubre un modulo, ese hotel se
    queda sin la pantalla.
    """

    # Rutas del frontend que exigen entrada de menu (app.routes.ts, sin redirects,
    # sin `platformAdminOnly` y sin las que el guard deja pasar siempre).
    HOTEL_ROUTES = {
        "/dashboard",
        "/clientes",
        "/reservas",
        "/habitaciones",
        # Las tres pantallas del catalogo comercial viven en una sola ruta.
        "/catalogo-comercial",
        # Igual facturas, pagos y reembolsos.
        "/facturacion",
        # Ingresos y egresos viven en una sola ruta; control financiero sigue aparte.
        "/finanzas",
        "/control-financiero",
        # Igual items, dotacion por habitacion y movimientos.
        "/inventario",
        # Igual limpieza y mantenimiento.
        "/limpieza-mantenimiento",
        "/reportes",
        "/hotel-config",
        "/usuarios-hotel",
    }

    # Administracion de la plataforma: definen quien entra, con que permisos y sobre que
    # enums opera el codigo. Un hotel no las ve (AGENTS.md 5.17).
    PLATFORM_ROUTES = {
        "/saas-panel",
        "/saas-hoteles",
        "/saas-solicitudes-demo",
        "/saas-amenidades",
        "/usuarios",
        "/roles",
        "/recursos",
        "/master-data",
    }

    @classmethod
    def setUpTestData(cls):
        call_command("seed_rbac", stdout=StringIO())

    def _menu_routes(self, user):
        routes = set()

        def walk(items):
            for item in items or []:
                route = (item.get("route") or "").strip()
                if route:
                    routes.add(route)
                walk(item.get("children"))

        walk(UserSerializer(user).data.get("menu"))
        return routes

    def _user_with_role(self, username, slug, hotel=None):
        user = User.objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="Pass12345!",
            hotel_settings=hotel,
        )
        UserRole.objects.create(user=user, role=Role.objects.get(slug=slug), is_active=True)
        return user

    def test_every_declared_scope_has_an_active_resource(self):
        declared = _collect_declared_scopes()
        self.assertGreater(len(declared), 60, "El recorrido de URLs no encontro los ViewSets.")

        active = set(Resource.objects.filter(is_active=True).values_list("key", flat=True))
        missing = sorted(declared - active)

        self.assertEqual(missing, [], f"Scopes sin Resource sembrado: {missing}")

    def test_admin_role_covers_the_whole_operation(self):
        keys = set(
            Resource.objects.filter(
                is_active=True,
                roleresource__is_active=True,
                roleresource__role__slug="admin",
            ).values_list("key", flat=True)
        )

        # Exclusiones deliberadas:
        # - `amenities.write`: catalogo global, solo el admin de plataforma (5.14).
        # - `roles.write/roles.read_deleted/resources.*`: administracion de la plataforma (5.17).
        platform_only = {
            scope
            for scope in _collect_declared_scopes()
            if scope.split(".")[0] in {"resources"}
            or scope in {"roles.write", "roles.read_deleted"}
        }
        missing = sorted(
            _collect_declared_scopes() - keys - {"amenities.write"} - platform_only
        )

        self.assertEqual(missing, [], f"El rol 'admin' no cubre: {missing}")

    def test_new_hotel_admin_sees_every_hotel_route(self):
        hotel = HotelSettings.objects.create(hotel_name="Hotel Recien Convertido")
        user = self._user_with_role("nuevo_admin", "admin", hotel=hotel)

        routes = self._menu_routes(user)
        missing = sorted(self.HOTEL_ROUTES - routes)

        self.assertEqual(missing, [], f"Rutas fuera del menu del hotel nuevo: {missing}")
        self.assertEqual(
            routes & self.PLATFORM_ROUTES,
            set(),
            "Un administrador de hotel no debe ver el menu del panel SaaS.",
        )

    def test_platform_admin_role_exposes_the_saas_menu(self):
        user = self._user_with_role("admin_plataforma", "platform_admin")

        routes = self._menu_routes(user)
        missing = sorted(self.PLATFORM_ROUTES - routes)

        self.assertEqual(missing, [], f"Rutas SaaS fuera del menu: {missing}")

    def test_seed_is_idempotent(self):
        before = Resource.objects.filter(is_active=True).count()
        call_command("seed_rbac", stdout=StringIO())

        self.assertEqual(Resource.objects.filter(is_active=True).count(), before)

    def test_seed_creates_admin_only_public_job_title_catalog(self):
        self.assertGreater(JobTitle.objects.filter(is_active=True).count(), 0)

        response = self.client.get("/api/roles/public-job-titles/")

        self.assertEqual(response.status_code, 200)
        names = {entry["name"] for entry in response.data}
        self.assertIn("Administrador general", names)
        self.assertNotIn("Gerente general", names)
        self.assertNotIn("Recepcionista", names)
        self.assertTrue(all(entry["role_id"] == str(Role.objects.get(slug="admin").id) for entry in response.data))


TRUSTED_FRONTEND = "https://app.wayra.test"


@override_settings(
    CSRF_TRUSTED_ORIGINS=[TRUSTED_FRONTEND],
    CORS_ALLOWED_ORIGINS=[TRUSTED_FRONTEND],
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class PasswordResetBaseUrlTests(APITestCase):
    """El enlace con uid+token solo puede apuntar a un origen de confianza (auditoria, Bloque 1 #1)."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="reset_target",
            email="reset_target@example.com",
            password="pass12345",
        )

    def _request_reset(self, base_url):
        mail.outbox.clear()
        response = self.client.post(
            "/api/auth/password/reset/",
            {"email": self.user.email, "base_url": base_url},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        bodies = [message.body] + [content for content, _ in getattr(message, "alternatives", [])]
        return "\n".join(bodies)

    def test_trusted_base_url_is_used_for_the_link(self):
        body = self._request_reset(f"{TRUSTED_FRONTEND}/reset-password")

        self.assertIn(f"{TRUSTED_FRONTEND}/reset-password?uid=", body)

    def test_untrusted_base_url_is_ignored(self):
        body = self._request_reset("https://evil.example/reset-password")

        self.assertNotIn("evil.example", body)
        self.assertIn("/reset-password?uid=", body)

    def test_userinfo_trick_does_not_pass_as_trusted_origin(self):
        body = self._request_reset("https://app.wayra.test@evil.example/reset-password")

        self.assertNotIn("evil.example", body)

    def test_non_http_scheme_is_ignored(self):
        body = self._request_reset("javascript:alert(1)//")

        self.assertNotIn("javascript:", body)


@override_settings(
    ALLOW_PUBLIC_USER_REGISTRATION=True,
    PUBLIC_USER_REGISTRATION_TOKEN="public-token",
)
class PublicRegisterRequiresScopeWhenAuthenticatedTests(APITestCase):
    """Con el registro publico activo, una sesion sin `users.write` no crea usuarios (Bloque 1 #2)."""

    def setUp(self):
        self.hotel = create_configured_hotel(hotel_name="Hotel Registro")
        self.user = User.objects.create_user(
            username="sin_permisos",
            email="sin_permisos@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
        )

    def _payload(self, username):
        return {
            "first_name": "Nuevo",
            "last_name": "Usuario",
            "username": username,
            "email": f"{username}@example.com",
            "job_title": "Recepcionista",
            "password": "Pass12345!",
        }

    def test_authenticated_user_without_users_write_is_forbidden(self):
        self.client.force_login(self.user)

        response = self.client.post(
            "/api/users/register/",
            self._payload("colado"),
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="colado").exists())

    def test_anonymous_register_still_requires_the_public_token(self):
        response = self.client.post(
            "/api/users/register/",
            self._payload("anonimo"),
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="anonimo").exists())


class RestoreTenantIsolationTests(APITestCase):
    """`restore` no puede alcanzar registros borrados de otro hotel (Bloque 2 #3)."""

    def setUp(self):
        self.hotel_a = create_configured_hotel(hotel_name="Hotel A")
        self.hotel_b = create_configured_hotel(hotel_name="Hotel B")

        resources = [
            Resource.objects.create(key=key, name=key)
            for key in ("hotel_settings.read", "hotel_settings.write", "users.read", "users.write")
        ]
        role = Role.objects.create(name="Admin Hotel B", slug="admin-hotel-b")
        role.resources.add(*resources)

        self.actor_b = User.objects.create_user(
            username="admin_b",
            email="admin_b@example.com",
            password="pass12345",
            hotel_settings=self.hotel_b,
        )
        self.actor_b.roles.add(role)
        self.victim_a = User.objects.create_user(
            username="usuario_a",
            email="usuario_a@example.com",
            password="pass12345",
            hotel_settings=self.hotel_a,
        )
        self.colleague_b = User.objects.create_user(
            username="usuario_b",
            email="usuario_b@example.com",
            password="pass12345",
            hotel_settings=self.hotel_b,
        )

    def _soft_delete(self, instance):
        from django.contrib.contenttypes.models import ContentType
        from accounts.models import SoftDeleteMarker

        SoftDeleteMarker.objects.create(
            content_type=ContentType.objects.get_for_model(instance.__class__),
            object_id=str(instance.pk),
        )

    def test_cannot_restore_hotel_settings_of_another_hotel(self):
        self._soft_delete(self.hotel_a)
        self.client.force_login(self.actor_b)

        response = self.client.post(f"/api/hotel-settings/{self.hotel_a.id}/restore/")

        self.assertEqual(response.status_code, 404)
        self.assertNotIn("address", response.data)

    def test_cannot_restore_user_of_another_hotel(self):
        self._soft_delete(self.victim_a)
        self.client.force_login(self.actor_b)

        response = self.client.post(f"/api/users/{self.victim_a.pk}/restore/")

        self.assertEqual(response.status_code, 404)
        self.assertNotIn("email", response.data)

    def test_can_restore_user_of_own_hotel(self):
        self._soft_delete(self.colleague_b)
        self.client.force_login(self.actor_b)

        response = self.client.post(f"/api/users/{self.colleague_b.pk}/restore/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["username"], "usuario_b")


class SchemaServePermissionsTests(APITestCase):
    """El esquema OpenAPI no queda publico fuera de DEBUG (Bloque 15 #1)."""

    def test_production_settings_restrict_schema_to_staff(self):
        from backend.settings import schema_serve_permissions

        self.assertEqual(
            schema_serve_permissions(False),
            ["rest_framework.permissions.IsAdminUser"],
        )

    def test_schema_views_use_the_configured_permissions(self):
        from django.conf import settings as django_settings
        from django.utils.module_loading import import_string
        from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

        configured = [
            import_string(path)
            for path in django_settings.SPECTACULAR_SETTINGS["SERVE_PERMISSIONS"]
        ]
        self.assertEqual(list(SpectacularAPIView.permission_classes), configured)
        self.assertEqual(list(SpectacularSwaggerView.permission_classes), configured)

    def test_schema_and_docs_reject_anonymous_with_production_permissions(self):
        from unittest.mock import patch
        from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
        from rest_framework.permissions import IsAdminUser

        # drf-spectacular fija `permission_classes` al importar la vista, asi que el valor
        # de produccion se inyecta directamente en vez de recargar settings.
        with patch.object(SpectacularAPIView, "permission_classes", [IsAdminUser]), patch.object(
            SpectacularSwaggerView, "permission_classes", [IsAdminUser]
        ):
            self.assertEqual(self.client.get("/api/schema/").status_code, 403)
            self.assertEqual(self.client.get("/api/docs/").status_code, 403)

            staff = User.objects.create_superuser(
                username="staff_docs",
                email="staff_docs@example.com",
                password="pass12345",
            )
            self.client.force_login(staff)
            response = self.client.get("/api/schema/")
            self.assertEqual(response.status_code, 200, getattr(response, "content", b"")[:300])


class ForcedPasswordChangeWithInactiveHotelTests(APITestCase):
    """Cambio obligatorio + hotel desactivado no deja al usuario sin salida (Bloque 15 #2)."""

    def setUp(self):
        self.hotel = HotelSettings.objects.create(hotel_name="Hotel Suspendido")
        self.user = User.objects.create_user(
            username="temporal",
            email="temporal@example.com",
            password="pass12345",
            hotel_settings=self.hotel,
            must_change_password=True,
        )

    def test_password_change_is_allowed_while_hotel_is_inactive(self):
        self.client.force_login(self.user)
        self.hotel.is_active = False
        self.hotel.save()

        response = self.client.post(
            "/api/auth/password/change/",
            {"old_password": "pass12345", "new_password": "Newpass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.must_change_password)

        # El resto de la API sigue bloqueado por el hotel desactivado.
        blocked = self.client.get("/api/users/")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json().get("code"), "hotel_inactive")


class ViewSetMixinOrderTests(TestCase):
    """
    `TenantScopeMixin.get_queryset()` no llama a `super()`: si va antes que
    `LogicalDeleteViewSetMixin` en el MRO, el filtro de borrado logico e `is_active` nunca
    corre (auditoria, hallazgo transversal). Recorre las URLs registradas para que un ViewSet
    nuevo con el orden invertido haga fallar esta prueba.
    """

    def test_logical_delete_mixin_precedes_tenant_scope_mixin(self):
        from accounts.soft_delete import LogicalDeleteViewSetMixin
        from accounts.tenancy import TenantScopeMixin

        offenders: set[str] = set()

        def walk(patterns):
            for entry in patterns:
                nested = getattr(entry, "url_patterns", None)
                if nested is not None:
                    walk(nested)
                    continue
                view_class = getattr(entry.callback, "cls", None)
                if view_class is None:
                    continue
                mro = view_class.__mro__
                if LogicalDeleteViewSetMixin in mro and TenantScopeMixin in mro:
                    if mro.index(TenantScopeMixin) < mro.index(LogicalDeleteViewSetMixin):
                        offenders.add(view_class.__name__)

        walk(get_resolver().url_patterns)

        self.assertEqual(sorted(offenders), [], "Orden de mixins invertido")


class UserLogicalDeleteTests(APITestCase):
    """Auditoria, Bloque 1 #3: eliminar un usuario es borrado logico real, y se restaura."""

    def setUp(self):
        self.hotel = create_configured_hotel(hotel_name="Hotel Usuarios")
        role = Role.objects.create(name="Admin usuarios", slug="admin-usuarios-b1")
        for key in ("users.read", "users.write", "users.read_deleted"):
            role.resources.add(Resource.objects.create(key=key, name=key))
        self.admin = User.objects.create_user(
            username="admin_b1", email="admin_b1@example.com", password="pass12345",
            hotel_settings=self.hotel,
        )
        self.admin.roles.add(role)
        self.target = User.objects.create_user(
            username="objetivo_b1", email="objetivo_b1@example.com", password="pass12345",
            hotel_settings=self.hotel,
        )
        self.client.force_login(self.admin)

    def _usernames(self, **params):
        response = self.client.get("/api/users/", params)
        rows = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
        return {row["username"] for row in rows}

    def test_deleted_user_leaves_the_list_and_can_be_restored(self):
        self.assertEqual(self.client.delete(f"/api/users/{self.target.pk}/").status_code, 204)

        self.assertNotIn("objetivo_b1", self._usernames())
        self.assertIn("objetivo_b1", self._usernames(include_deleted="true"))

        restored = self.client.post(f"/api/users/{self.target.pk}/restore/")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertIn("objetivo_b1", self._usernames())

    def test_deleted_user_cannot_log_in(self):
        self.client.delete(f"/api/users/{self.target.pk}/")
        self.client.logout()

        response = self.client.post(
            "/api/auth/login/", {"username": "objetivo_b1", "password": "pass12345"}, format="json"
        )

        self.assertEqual(response.status_code, 401)


class UserUpdateKeepsExtraRolesTests(APITestCase):
    """Bloque 1 #4: editar un usuario no le quita en silencio sus roles adicionales."""

    def setUp(self):
        self.hotel = create_configured_hotel(hotel_name="Hotel Roles")
        self.primary = Role.objects.create(name="Recepcion", slug="recepcion-b1")
        self.extra = Role.objects.create(name="Caja", slug="caja-b1")
        JobTitle.objects.create(role=self.primary, name="Recepcionista", slug="recepcionista")
        self.target = User.objects.create_user(
            username="dos_roles", email="dos_roles@example.com", password="pass12345",
            hotel_settings=self.hotel,
        )
        UserRole.objects.create(user=self.target, role=self.primary, is_active=True)
        UserRole.objects.create(user=self.target, role=self.extra, is_active=True)
        self.client.force_login(
            User.objects.create_superuser(
                username="platform_b1", email="platform_b1@example.com", password="pass12345"
            )
        )

    def _active_roles(self):
        return set(
            UserRole.objects.filter(user=self.target, is_active=True).values_list("role__slug", flat=True)
        )

    def test_resending_a_role_the_user_already_has_keeps_the_others(self):
        response = self.client.patch(
            f"/api/users/{self.target.pk}/",
            {"email": "nuevo_correo@example.com", "role": str(self.primary.pk)},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._active_roles(), {"recepcion-b1", "caja-b1"})


class ResourceParentCycleTests(APITestCase):
    """Bloque 1 #5: el menu no admite ciclos de padres."""

    def setUp(self):
        self.client.force_login(
            User.objects.create_superuser(
                username="platform_menu", email="platform_menu@example.com", password="pass12345"
            )
        )
        self.group = Resource.objects.create(key="grupo.menu", name="Grupo", is_menu=True)
        self.child = Resource.objects.create(
            key="hijo.menu", name="Hijo", is_menu=True, parent=self.group
        )

    def test_parent_cannot_close_a_cycle(self):
        response = self.client.patch(
            f"/api/resources/{self.group.pk}/", {"parent": str(self.child.pk)}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.group.refresh_from_db()
        self.assertIsNone(self.group.parent_id)

    def test_resource_cannot_be_its_own_parent(self):
        response = self.client.patch(
            f"/api/resources/{self.group.pk}/", {"parent": str(self.group.pk)}, format="json"
        )

        self.assertEqual(response.status_code, 400)


class JobTitleManagementTests(APITestCase):
    """Bloque 1 #6: los cargos de un rol se pueden crear, renombrar y desactivar."""

    def setUp(self):
        self.role = Role.objects.create(name="Mantenimiento", slug="mantenimiento-b1")
        self.url = f"/api/roles/{self.role.pk}/job-titles/"
        self.client.force_login(
            User.objects.create_superuser(
                username="platform_jobs", email="platform_jobs@example.com", password="pass12345"
            )
        )

    def test_create_rename_and_deactivate_a_job_title(self):
        created = self.client.post(self.url, {"name": "Tecnico electrico"}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        job_title_id = created.data["id"]

        duplicate = self.client.post(self.url, {"name": "Tecnico electrico"}, format="json")
        self.assertEqual(duplicate.status_code, 400)

        renamed = self.client.patch(f"{self.url}{job_title_id}/", {"name": "Electricista"}, format="json")
        self.assertEqual(renamed.status_code, 200, renamed.data)
        self.assertEqual(renamed.data["slug"], "electricista")

        deactivated = self.client.patch(f"{self.url}{job_title_id}/", {"is_active": False}, format="json")
        self.assertEqual(deactivated.status_code, 200, deactivated.data)

        self.assertEqual(self.client.get(self.url).data, [])
        everything = self.client.get(self.url, {"include_inactive": "true"}).data
        self.assertEqual([row["name"] for row in everything], ["Electricista"])

    def test_managing_job_titles_requires_roles_write(self):
        hotel = create_configured_hotel(hotel_name="Hotel Cargos")
        reader_role = Role.objects.create(name="Solo lectura", slug="solo-lectura-b1")
        reader_role.resources.add(Resource.objects.create(key="roles.read", name="roles.read"))
        reader = User.objects.create_user(
            username="lector_cargos", email="lector_cargos@example.com", password="pass12345",
            hotel_settings=hotel,
        )
        reader.roles.add(reader_role)
        self.client.force_login(reader)

        response = self.client.post(self.url, {"name": "Intruso"}, format="json")

        self.assertEqual(response.status_code, 403)
        self.assertFalse(JobTitle.objects.filter(name="Intruso").exists())


class AuthHardeningTests(APITestCase):
    """Auditoria, Bloque 15 #4-#6."""

    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.user = User.objects.create_user(
            username="fortaleza", email="fortaleza@example.com", password="Clave-Segura-2026",
            hotel_settings=create_configured_hotel(hotel_name="Hotel Claves"),
        )

    def test_weak_new_password_is_rejected(self):
        self.client.force_login(self.user)

        response = self.client.post(
            "/api/auth/password/change/",
            {"old_password": "Clave-Segura-2026", "new_password": "12345678"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Clave-Segura-2026"))

    def test_reset_confirm_has_the_password_reset_throttle(self):
        from accounts.views import PasswordResetConfirmView

        self.assertEqual(PasswordResetConfirmView.throttle_scope, "password_reset")

    @override_settings(ADMIN_LOGIN_ATTEMPTS_PER_MINUTE=2)
    def test_admin_login_is_throttled_after_failed_attempts(self):
        payload = {"username": "nadie", "password": "mal", "next": "/admin/"}
        statuses = [self.client.post("/admin/login/", payload).status_code for _ in range(3)]

        self.assertEqual(statuses[:2], [200, 200])
        self.assertEqual(statuses[2], 429)


class AuditTrailCoverageAndPagingTests(APITestCase):
    """Auditoria, Bloque 11 #1-#3."""

    def setUp(self):
        from accounts.models import AuditLog

        self.AuditLog = AuditLog
        self.hotel_a = create_configured_hotel(hotel_name="Hotel Rastro A")
        self.hotel_b = create_configured_hotel(hotel_name="Hotel Rastro B")
        self.client.force_login(
            User.objects.create_superuser(
                username="platform_audit", email="platform_audit@example.com", password="pass12345"
            )
        )

    def test_listing_is_always_paginated(self):
        response = self.client.get("/api/audit/")

        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, dict)
        self.assertIn("count", response.data)
        self.assertLessEqual(len(response.data["results"]), 50)

    def test_platform_admin_can_narrow_to_one_hotel_and_sees_its_name(self):
        response = self.client.get("/api/audit/", {"hotel_settings": self.hotel_b.id, "page_size": 200})

        rows = response.data["results"]
        self.assertTrue(rows)
        self.assertEqual({row["hotel_settings_id"] for row in rows}, {self.hotel_b.id})
        self.assertEqual({row["hotel_name"] for row in rows}, {"Hotel Rastro B"})

    def test_demo_requests_are_audited(self):
        from accounts.audit import is_audited
        from apps.demo_requests.models import DemoRequest

        self.assertTrue(is_audited(DemoRequest))


class RoleLogicalDeleteListingTests(APITestCase):
    """Auditoria, Bloque 1 #7: un rol eliminado no se lista y se puede restaurar."""

    def test_deleted_role_leaves_the_list_and_comes_back_on_restore(self):
        self.client.force_login(
            User.objects.create_superuser(
                username="platform_roles_del", email="prd@example.com", password="pass12345"
            )
        )
        role = Role.objects.create(name="Temporal", slug="temporal-b1")

        self.assertEqual(self.client.delete(f"/api/roles/{role.pk}/").status_code, 204)
        listed = {row["slug"] for row in self.client.get("/api/roles/").data}
        with_deleted = {row["slug"] for row in self.client.get("/api/roles/", {"include_deleted": "true"}).data}

        self.assertNotIn("temporal-b1", listed)
        self.assertIn("temporal-b1", with_deleted)
        self.assertEqual(self.client.post(f"/api/roles/{role.pk}/restore/").status_code, 200)
        self.assertIn("temporal-b1", {row["slug"] for row in self.client.get("/api/roles/").data})


@override_settings(LOGIN_FAILURES_PER_ACCOUNT=3)
class LoginAccountThrottleTests(APITestCase):
    """Fallos repetidos contra una cuenta la frenan aunque cambie la IP (Bloque 15 #7)."""

    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.hotel = create_configured_hotel(hotel_name="Hotel Fuerza Bruta")
        User.objects.create_user(
            username="objetivo_login",
            password="Pass12345!",
            hotel_settings=self.hotel,
        )

    def _login(self, password, ip):
        return self.client.post(
            "/api/auth/login/",
            {"username": "objetivo_login", "password": password},
            format="json",
            REMOTE_ADDR=ip,
        )

    def test_failures_from_many_ips_lock_the_account_for_a_while(self):
        for index in range(3):
            self.assertEqual(self._login("mala", f"10.0.0.{index}").status_code, 401)

        # Ni con la contrasena correcta, ni desde otra IP, mientras dure la ventana.
        locked = self._login("Pass12345!", "10.0.0.99")
        self.assertEqual(locked.status_code, 429)
        self.assertEqual(locked.data["code"], "account_throttled")

    def test_a_successful_login_resets_the_counter(self):
        self.assertEqual(self._login("mala", "10.0.1.1").status_code, 401)
        self.assertEqual(self._login("mala", "10.0.1.2").status_code, 401)
        self.assertEqual(self._login("Pass12345!", "10.0.1.3").status_code, 200)
        self.client.logout()
        self.assertEqual(self._login("mala", "10.0.1.4").status_code, 401)
        self.assertEqual(self._login("mala", "10.0.1.5").status_code, 401)
        self.assertEqual(self._login("Pass12345!", "10.0.1.6").status_code, 200)


class HealthAndSessionCodeTests(APITestCase):
    def test_health_reports_the_database(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["database"], "ok")

    def test_health_fails_when_the_database_does_not_answer(self):
        # Bloque 15 #8: un proceso sin base de datos no es un proceso sano.
        from unittest.mock import patch

        with patch("accounts.views.connection.cursor", side_effect=RuntimeError("db down")):
            response = self.client.get("/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["database"], "unavailable")

    def test_expired_session_has_its_own_code(self):
        # Bloque 1 #15: el frontend distingue "sesion vencida" de "sin permiso".
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "not_authenticated")


class MustChangePasswordWithInactiveHotelTests(APITestCase):
    """Bloque 15 #10: `must_change_password` combinado con un hotel inactivo."""

    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.hotel = create_configured_hotel(hotel_name="Hotel Apagado", is_active=False)
        self.user = User.objects.create_user(
            username="primer_ingreso_apagado",
            password="Pass12345!",
            hotel_settings=self.hotel,
            must_change_password=True,
        )

    def test_login_is_refused_with_the_hotel_inactive_code(self):
        response = self.client.post(
            "/api/auth/login/",
            {"username": "primer_ingreso_apagado", "password": "Pass12345!"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "hotel_inactive")

    def test_the_forced_password_change_is_still_reachable(self):
        # La correccion de B15 #2: con el hotel inactivo, el usuario puede al menos salir del
        # estado "debe cambiar la contrasena"; no queda atrapado entre los dos middlewares.
        # El resto de la API le sigue cerrada.
        self.client.force_login(self.user)
        response = self.client.post(
            "/api/auth/password/change/",
            {"old_password": "Pass12345!", "new_password": "OtraClave987!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.user.refresh_from_db()
        self.assertFalse(self.user.must_change_password)
        self.assertEqual(self.client.get("/api/rooms/").json().get("code"), "hotel_inactive")
