from django.db.models import ProtectedError
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from .models import MasterData
from .serializers import MasterDataSerializer


class MasterDataViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = MasterData.objects.all().order_by("group", "sort_order", "name")
    serializer_class = MasterDataSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["master_data.read"]

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["group", "code", "name", "description"]
    ordering_fields = ["id", "group", "sort_order", "name", "created_at", "updated_at"]
    ordering = ["group", "sort_order", "name"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["master_data.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        group = (self.request.query_params.get("group") or "").strip().upper()
        is_active = (self.request.query_params.get("is_active") or "").strip().lower()

        if group:
            queryset = queryset.filter(group=group)

        if is_active in {"true", "1", "yes", "si"}:
            queryset = queryset.filter(is_active=True)
        elif is_active in {"false", "0", "no"}:
            queryset = queryset.filter(is_active=False)

        return queryset

    @action(detail=False, methods=["get"], url_path="groups")
    def groups(self, request):
        labels_by_code = {code: label for code, label in MasterData.Group.choices}
        existing_codes = set(
            MasterData.objects.values_list("group", flat=True)
            .order_by("group")
            .distinct()
        )
        all_codes = sorted(set(labels_by_code.keys()) | existing_codes)
        groups = [
            {
                "code": code,
                "label": labels_by_code.get(code) or self._humanize_group(code),
            }
            for code in all_codes
        ]
        return Response(groups, status=status.HTTP_200_OK)

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {
                    "detail": (
                        "No se puede eliminar este valor porque está siendo utilizado en otros registros. "
                        "Desactívalo con is_active=false si deseas ocultarlo."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    @staticmethod
    def _humanize_group(code: str) -> str:
        return str(code or "").replace("_", " ").strip().title()
