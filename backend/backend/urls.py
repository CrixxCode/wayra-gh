from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from accounts.views import (
    PasswordResetRequestView,
    PasswordResetConfirmView,
    PasswordChangeView,
    HealthCheckView,
    ProfileUpdateView,
)

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


from accounts.views import (
    CsrfInitView, SessionLoginView, SessionLogoutView, MeSessionView,
    NotificationReadStateView, NotificationMarkReadView, NotificationMarkUnreadView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("accounts.urls")),

    path("health/", HealthCheckView.as_view(), name="healthcheck"),

    path("api/auth/csrf/", CsrfInitView.as_view(), name="csrf_init"),
    path("api/auth/me/", MeSessionView.as_view(), name="session_me"),
    path("api/auth/login/", SessionLoginView.as_view(), name="session_login"),
    path("api/auth/logout/", SessionLogoutView.as_view(), name="session_logout"),
    path("api/auth/password/change/", PasswordChangeView.as_view(), name="password_change"),
    path("api/auth/password/reset/", PasswordResetRequestView.as_view(), name="password_reset"),
    path("api/auth/password/reset/confirm/", PasswordResetConfirmView.as_view(), name="password_reset_confirm"),
    path("api/auth/me/update/", ProfileUpdateView.as_view(), name="profile_update"),
    path("api/auth/notifications/read-state/", NotificationReadStateView.as_view(), name="notifications_read_state"),
    path("api/auth/notifications/mark-read/", NotificationMarkReadView.as_view(), name="notifications_mark_read"),
    path("api/auth/notifications/mark-unread/", NotificationMarkUnreadView.as_view(), name="notifications_mark_unread"),

    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),

    path("api/", include("apps.clients.urls")),
    path("api/", include("apps.hotel_settings.urls")),
    path("api/", include("apps.master_data.urls")),
    path("api/", include("apps.rooms.urls")),
    path("api/", include("apps.reservations.urls")),
    path("api/", include("apps.services.urls")),
    path("api/", include("apps.packages.urls")),
    path("api/", include("apps.billing.urls")),
    path("api/", include("apps.promotions.urls")),
    path("api/", include("apps.inventory.urls")),
    path("api/", include("apps.finance.urls")),
    path("api/", include("apps.reports.urls")),
    path("api/", include("apps.notifications.urls")),
    path("api/", include("apps.demo_requests.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

if (settings.FRONTEND_DIST_DIR / "index.html").exists():
    urlpatterns += [
        re_path(
            r"^(?!api/|admin/|health/|static/|media/).*$",
            TemplateView.as_view(template_name="index.html"),
            name="frontend_app",
        ),
    ]
