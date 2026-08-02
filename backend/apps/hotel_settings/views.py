from django.db import transaction
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.pagination import OptionalPageNumberPagination
from accounts.permissions import HasResourcePermission
from accounts.soft_delete import LogicalDeleteViewSetMixin
from accounts.tenancy import TenantScopeMixin, is_effective_global_admin
from apps.master_data.models import MasterData
from apps.rooms.models import Room

from .models import HotelFloor, HotelSettings, ReservationPolicy
from .serializers import HotelFloorSerializer, HotelSettingsSerializer, ReservationPolicySerializer


class HotelSettingsViewSet(LogicalDeleteViewSetMixin, viewsets.ModelViewSet):
    queryset = HotelSettings.objects.all().order_by("-id")
    serializer_class = HotelSettingsSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    required_scopes = ["hotel_settings.read"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["hotel_settings.write"]
        return self.required_scopes

    def get_permissions(self):
        # Engancha scopes dinamicos antes de evaluar permisos
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    def get_queryset(self):
        queryset = super().get_queryset()
        user = getattr(self.request, "user", None)

        if not user or not user.is_authenticated:
            return queryset.none()

        if is_effective_global_admin(user):
            return queryset

        if user.hotel_settings_id is None:
            return queryset.none()

        return queryset.filter(id=user.hotel_settings_id)

    def perform_create(self, serializer):
        settings_obj = serializer.save()
        user = getattr(self.request, "user", None)

        # Flujo bootstrap/recovery: en creacion siempre vinculamos al usuario
        # no-superuser con el hotel recien creado.
        if (
            user
            and user.is_authenticated
            and not is_effective_global_admin(user)
        ):
            user.hotel_settings = settings_obj
            user.save(update_fields=["hotel_settings"])

    def _resolve_current_settings(self):
        requested_hotel_id = (
            self.request.query_params.get("hotel_settings")
            or self.request.data.get("hotel_settings")
            or ""
        )
        requested_hotel_id = str(requested_hotel_id).strip()
        queryset = self.get_queryset()

        if requested_hotel_id.isdigit():
            return queryset.filter(id=int(requested_hotel_id)).first()

        return queryset.first()

    def _clear_settings_payload(self, settings_obj: HotelSettings):
        return {
            "legal_name": None,
            "slogan": None,
            "description": None,
            "logo": None,
            "stars": 3,
            "facebook": None,
            "instagram": None,
            "twitter_x": None,
            "address": None,
            "city": None,
            "state": None,
            "country": None,
            "postal_code": None,
            "primary_phone": None,
            "secondary_phone": None,
            "general_email": None,
            "reservations_email": None,
            "website": None,
            "check_in_time": None,
            "check_out_time": None,
            "max_guests_per_room": 2,
            "currency": "COP",
            "tax_rate": 0,
            "system_language": "es",
            "timezone": "America/Bogota",
        }

    def create(self, request, *args, **kwargs):
        """
        Usuarios de hotel solo pueden administrar su hotel asignado.
        Superusuarios pueden crear hoteles adicionales.
        """
        user = getattr(request, "user", None)
        if (
            user
            and user.is_authenticated
            and not is_effective_global_admin(user)
            and self.get_queryset().exists()
        ):
            return Response(
                {
                    "detail": (
                        "Este usuario ya tiene un hotel asignado. "
                        "Debes actualizar esa configuracion en lugar de crear otra."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="current")
    def current(self, request):
        """
        Devuelve la configuracion actual del hotel.
        """
        settings_obj = self._resolve_current_settings()

        if not settings_obj:
            return Response(None, status=status.HTTP_200_OK)

        serializer = self.get_serializer(settings_obj)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["post"], url_path="clear")
    def clear(self, request):
        """
        Limpia la configuracion del hotel.
        Mantiene el hotel (HotelSettings) y elimina logicamente pisos/habitaciones.
        """
        user = getattr(request, "user", None)
        requested_hotel_id = (
            request.query_params.get("hotel_settings")
            or request.data.get("hotel_settings")
            or ""
        )
        requested_hotel_id = str(requested_hotel_id).strip()

        if (
            user
            and user.is_authenticated
            and is_effective_global_admin(user)
            and not requested_hotel_id
        ):
            return Response(
                {
                    "detail": (
                        "Como superadmin debes indicar el hotel a eliminar "
                        "con 'hotel_settings' en query param o body."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj = self._resolve_current_settings()

        if not settings_obj:
            return Response(
                {"detail": "No hotel settings found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        with transaction.atomic():
            floors = list(HotelFloor.objects.filter(hotel_settings=settings_obj))
            floor_ids = [f.id for f in floors]
            if floor_ids:
                rooms = list(Room.objects.filter(floor_id__in=floor_ids))
                for room in rooms:
                    self.perform_destroy(room)
                for floor in floors:
                    self.perform_destroy(floor)

            reset_payload = self._clear_settings_payload(settings_obj)
            for field, value in reset_payload.items():
                setattr(settings_obj, field, value)
            settings_obj.save(update_fields=list(reset_payload.keys()))

        return Response(
            {"detail": "Hotel settings cleared successfully."},
            status=status.HTTP_200_OK,
        )


class HotelFloorViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = HotelFloor.objects.select_related("hotel_settings").all().order_by("floor_number")
    serializer_class = HotelFloorSerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    tenant_filter = "hotel_settings"

    required_scopes = ["hotel_settings.read"]

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["hotel_settings.write"]
        return self.required_scopes

    def get_permissions(self):
        # Engancha scopes dinamicos antes de evaluar permisos
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()

    @staticmethod
    def _parse_bool(value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "si", "on"}

    @staticmethod
    def _build_room_number(prefix, room_index):
        return f"{prefix}{str(room_index).zfill(2)}"

    def _create_missing_rooms(self, floor):
        """
        Crea solo las habitaciones faltantes segun room_count/prefix.
        """
        target_numbers = [
            self._build_room_number(floor.prefix, room_index)
            for room_index in range(1, floor.room_count + 1)
        ]

        existing_by_number = {
            number: floor_id
            for number, floor_id in Room.objects.filter(
                number__in=target_numbers,
                floor__hotel_settings_id=floor.hotel_settings_id,
            ).values_list("number", "floor_id")
        }

        conflicting_numbers = sorted(
            number
            for number, floor_id in existing_by_number.items()
            if floor_id != floor.id
        )
        if conflicting_numbers:
            raise ValidationError(
                {
                    "room_count": (
                        "No se pudieron autogenerar habitaciones porque estos numeros "
                        f"ya existen en otro piso: {', '.join(conflicting_numbers)}"
                    )
                }
            )

        missing_numbers = [number for number in target_numbers if number not in existing_by_number]
        if missing_numbers:
            default_status = MasterData.objects.filter(
                group=MasterData.Group.ROOM_STATUS,
                code="DISPONIBLE",
            ).first()

            if not default_status:
                raise ValidationError(
                    {
                        "room_count": (
                            "No se pudo autogenerar habitaciones porque falta el catalogo "
                            "ROOM_STATUS:DISPONIBLE."
                        )
                    }
                )

            Room.objects.bulk_create(
                [Room(number=number, floor=floor, status=default_status) for number in missing_numbers]
            )

        return missing_numbers

    def _delete_extra_rooms(self, floor):
        """
        Elimina habitaciones del piso con secuencia > room_count.
        Solo se usa cuando el usuario lo solicita.
        """
        prefix_len = len(floor.prefix)
        room_ids_to_delete = []

        for room in Room.objects.filter(floor=floor):
            if not room.number.startswith(floor.prefix):
                continue

            suffix = room.number[prefix_len:]
            if not suffix.isdigit():
                continue

            if int(suffix) > floor.room_count:
                room_ids_to_delete.append(room.id)

        if room_ids_to_delete:
            rooms = Room.objects.filter(id__in=room_ids_to_delete)
            for room in rooms:
                self.perform_destroy(room)

        return room_ids_to_delete

    @transaction.atomic
    def perform_create(self, serializer):
        if self.is_global_admin():
            floor = serializer.save()
        else:
            floor = serializer.save(hotel_settings=self.request.user.hotel_settings)
        self._create_missing_rooms(floor)

    @transaction.atomic
    def perform_update(self, serializer):
        """
        Siempre crea faltantes.
        Solo borra extras si viene ?delete_extra_rooms=true en la URL.
        """
        delete_extra_rooms = self._parse_bool(
            self.request.query_params.get("delete_extra_rooms")
        )

        if self.is_global_admin():
            floor = serializer.save()
        else:
            floor = serializer.save(hotel_settings=self.request.user.hotel_settings)
        self._create_missing_rooms(floor)

        if delete_extra_rooms:
            self._delete_extra_rooms(floor)

    def create(self, request, *args, **kwargs):
        """
        Valida que exista la configuracion del hotel antes de crear pisos.
        """
        hotel_settings_id = request.data.get("hotel_settings")
        if not self.is_global_admin():
            hotel_settings_id = self.get_tenant_id()

        if not hotel_settings_id:
            return Response(
                {"hotel_settings": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not HotelSettings.objects.filter(id=hotel_settings_id).exists():
            return Response(
                {"hotel_settings": "Hotel settings not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return super().create(request, *args, **kwargs)

    @action(detail=False, methods=["get"], url_path="by-settings/(?P<settings_id>[^/.]+)")
    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="settings_id",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.PATH,
                required=True,
            )
        ]
    )
    def by_settings(self, request, settings_id=None):
        """
        Devuelve los pisos de una configuracion especifica.
        """
        floors = self.get_queryset().filter(hotel_settings_id=settings_id)
        serializer = self.get_serializer(floors, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

class ReservationPolicyViewSet(LogicalDeleteViewSetMixin, TenantScopeMixin, viewsets.ModelViewSet):
    queryset = (
        ReservationPolicy.objects.select_related(
            "hotel_settings",
            "policy_type",
            "penalty_type",
        ).order_by("-id")
    )
    serializer_class = ReservationPolicySerializer
    pagination_class = OptionalPageNumberPagination
    permission_classes = [HasResourcePermission]
    required_scopes = ["reservation-policies.read"]
    tenant_filter = "hotel_settings"

    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = [
        "name",
        "description",
        "policy_type__name",
        "policy_type__code",
        "penalty_type__name",
        "penalty_type__code",
        "hotel_settings__hotel_name",
    ]
    ordering_fields = [
        "id",
        "name",
        "penalty_value",
        "hours_before_checkin",
        "created_at",
        "updated_at",
    ]
    ordering = ["-id"]

    @staticmethod
    def _parse_bool(value):
        if isinstance(value, bool):
            return value
        if value is None:
            return None

        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "si", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
        return None

    def get_queryset(self):
        queryset = super().get_queryset()

        hotel_settings_id = (self.request.query_params.get("hotel_settings") or "").strip()
        if hotel_settings_id.isdigit():
            queryset = queryset.filter(hotel_settings_id=int(hotel_settings_id))

        is_active = self._parse_bool(self.request.query_params.get("is_active"))
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        return queryset

    def get_required_scopes(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return ["reservation-policies.write"]
        return self.required_scopes

    def get_permissions(self):
        self.required_scopes = self.get_required_scopes()
        return super().get_permissions()
