from rest_framework import serializers

from .models import MasterData


class MasterDataSerializer(serializers.ModelSerializer):
    group = serializers.CharField(max_length=60)
    group_label = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = MasterData
        fields = (
            "id",
            "group",
            "group_label",
            "code",
            "name",
            "description",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "group_label")

    def get_group_label(self, obj: MasterData) -> str:
        label = obj.get_group_display()
        if label and label != obj.group:
            return label
        return self._humanize_group(obj.group)

    def validate_group(self, value):
        group = str(value or "").strip().upper()
        if not group:
            raise serializers.ValidationError("El grupo es obligatorio.")
        return group

    def validate_code(self, value):
        value = str(value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("El código es obligatorio.")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)

        group = attrs.get("group", getattr(self.instance, "group", None))
        code = attrs.get("code", getattr(self.instance, "code", None))

        if group and code:
            queryset = MasterData.objects.filter(group=group, code=code)
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            if queryset.exists():
                raise serializers.ValidationError(
                    {"code": "Ya existe un valor con ese código en el grupo seleccionado."}
                )

        return attrs

    @staticmethod
    def _humanize_group(code: str) -> str:
        return str(code or "").replace("_", " ").strip().title()


class MasterDataCodeField(serializers.RelatedField):
    default_error_messages = {
        "invalid": "Valor inválido para el catálogo.",
        "not_found": "No existe un valor de catálogo para '{value}'.",
    }

    def __init__(self, *, group, **kwargs):
        self.group = group
        queryset = kwargs.pop(
            "queryset",
            MasterData.objects.filter(group=group, is_active=True)
        )
        super().__init__(queryset=queryset, **kwargs)

    def to_representation(self, value):
        return value.code if value else None

    def to_internal_value(self, data):
        if data in (None, ""):
            if self.allow_null:
                return None
            self.fail("invalid")

        queryset = self.get_queryset().filter(group=self.group)

        if isinstance(data, int) or (isinstance(data, str) and data.isdigit()):
            item = queryset.filter(id=int(data)).first()
            if item:
                return item
            self.fail("not_found", value=data)

        code = str(data).strip().upper()
        item = queryset.filter(code=code).first()
        if item:
            return item

        self.fail("not_found", value=data)
