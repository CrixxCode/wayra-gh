import logging

from rest_framework.permissions import BasePermission

from accounts.models import Resource
from accounts.tenancy import is_effective_global_admin

logger = logging.getLogger(__name__)


class HasResourcePermission(BasePermission):
    """
    1) If the view defines required_scopes (for example: ["users.read"]),
       validate against the user's Resource.key set.
    2) If the view does not define required_scopes, fallback to link_backend
       path matching for backward compatibility.
    """

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        if is_effective_global_admin(user):
            return True

        required = getattr(view, "required_scopes", None)

        if hasattr(view, "get_required_scopes") and callable(getattr(view, "get_required_scopes")):
            try:
                required = view.get_required_scopes()
            except Exception:
                logger.exception("Error resolving required scopes in %s", view.__class__.__name__)
                return False

        if required:
            required = self._append_deleted_read_scopes_if_needed(request, view, required)
            user_keys = self._normalize_scope_keys(user.resource_keys())
            return self._has_required_scopes(user_keys, required)

        path = (request.path or "").strip().lower()
        if not path.endswith("/"):
            path += "/"

        user_resources = Resource.objects.filter(
            is_active=True,
            roleresource__is_active=True,
            roleresource__role__is_active=True,
            roleresource__role__userrole__user=user,
            roleresource__role__userrole__is_active=True,
        ).distinct()

        for resource in user_resources:
            link = (resource.link_backend or "").strip().lower()
            if not link:
                continue
            if not link.endswith("/"):
                link += "/"
            if path.startswith(link):
                return True

        return False

    def _normalize_scope_keys(self, scopes):
        normalized: set[str] = set()
        for scope in scopes or []:
            variants = self._scope_variants(scope)
            normalized.update(variants)
        return normalized

    def _scope_variants(self, scope):
        normalized = str(scope or "").strip().lower()
        if not normalized:
            return set()

        variants = {normalized}
        if "_" in normalized:
            variants.add(normalized.replace("_", "-"))
        if "-" in normalized:
            variants.add(normalized.replace("-", "_"))
        return variants

    def _has_required_scopes(self, user_keys, required_scopes):
        if "*" in user_keys:
            return True

        for required in required_scopes:
            required_variants = self._scope_variants(required)
            if not required_variants:
                continue

            if self._scope_allowed_by_user_keys(required_variants, user_keys):
                continue

            return False

        return True

    def _scope_allowed_by_user_keys(self, required_variants, user_keys):
        if required_variants & user_keys:
            return True

        for scope in required_variants:
            resource_prefix = self._resource_prefix(scope)
            if not resource_prefix:
                continue

            wildcard_variants = self._scope_variants(f"{resource_prefix}.*")
            if wildcard_variants & user_keys:
                return True

        return False

    def _resource_prefix(self, scope):
        if "." not in scope:
            return ""
        return scope.rsplit(".", 1)[0]

    def _append_deleted_read_scopes_if_needed(self, request, view, required):
        scopes: list[str] = []
        for scope in required:
            if isinstance(scope, str) and scope and scope not in scopes:
                scopes.append(scope)

        include_deleted = False
        include_deleted_resolver = getattr(view, "_should_include_deleted", None)
        if callable(include_deleted_resolver):
            try:
                include_deleted = bool(include_deleted_resolver())
            except Exception:
                logger.exception(
                    "Error resolving include_deleted in %s",
                    view.__class__.__name__,
                )
                include_deleted = False

        if not include_deleted:
            return scopes

        if request.method not in ("GET", "HEAD", "OPTIONS"):
            return scopes

        extra_scopes: list[str] = []
        for scope in scopes:
            if scope.endswith(".read"):
                deleted_scope = f"{scope}_deleted"
                if deleted_scope not in scopes and deleted_scope not in extra_scopes:
                    extra_scopes.append(deleted_scope)

        return [*scopes, *extra_scopes]
