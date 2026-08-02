from django.contrib import admin

from apps.reservations.models import (
    Reservation,
    ReservationRoom,
    ReservationGuest,
    ReservationDeposit,
    ReservationInventoryCheck,
    ReservationInventoryCheckLine,
)


class ReservationRoomInline(admin.TabularInline):
    model = ReservationRoom
    extra = 1
    autocomplete_fields = ("room", "meal_plan")


class ReservationGuestInline(admin.TabularInline):
    model = ReservationGuest
    extra = 1
    autocomplete_fields = ("document_type",)


class ReservationDepositInline(admin.TabularInline):
    model = ReservationDeposit
    extra = 0
    autocomplete_fields = ("payment_method", "status")


class ReservationInventoryCheckLineInline(admin.TabularInline):
    model = ReservationInventoryCheckLine
    extra = 0
    autocomplete_fields = ("reservation_room", "room", "item")
    readonly_fields = ("difference_quantity", "created_at")


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "client",
        "status",
        "origin",
        "package",
        "package_price",
        "expected_check_in",
        "expected_check_out",
        "total_rooms",
        "total_guests",
        "created_by",
        "created_at",
    )
    list_filter = (
        "status",
        "origin",
        "expected_check_in",
        "expected_check_out",
        "created_at",
    )
    search_fields = (
        "id",
        "client__first_name",
        "client__last_name",
        "client__document_number",
        "client__email",
        "package__name",
        "package_name",
        "promo_code",
    )
    autocomplete_fields = (
        "client",
        "status",
        "origin",
        "package",
        "created_by",
    )
    readonly_fields = (
        "created_at",
        "total_rooms",
        "total_guests",
        "total_nights",
    )

    inlines = [
        ReservationRoomInline,
        ReservationGuestInline,
        ReservationDepositInline,
    ]

    fieldsets = (
        (
            "Reservation information",
            {
                "fields": (
                    "client",
                    "status",
                    "origin",
                    "package",
                    "package_name",
                    "package_price",
                    "created_by",
                )
            },
        ),
        (
            "Stay dates",
            {
                "fields": (
                    "expected_check_in",
                    "expected_check_out",
                    "real_check_in",
                    "real_check_out",
                )
            },
        ),
        (
            "Commercial information",
            {
                "fields": (
                    "promo_code",
                    "total_discount",
                    "notes",
                )
            },
        ),
        (
            "Calculated data",
            {
                "fields": (
                    "total_rooms",
                    "total_guests",
                    "total_nights",
                    "created_at",
                )
            },
        ),
    )


@admin.register(ReservationRoom)
class ReservationRoomAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reservation",
        "room",
        "night_rate",
        "adults",
        "children",
        "meal_plan",
        "subtotal",
        "created_at",
    )
    search_fields = (
        "reservation__id",
        "room__number",
    )
    autocomplete_fields = (
        "reservation",
        "room",
        "meal_plan",
    )


@admin.register(ReservationGuest)
class ReservationGuestAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reservation",
        "full_name",
        "document_type",
        "document_number",
        "nationality",
        "created_at",
    )
    search_fields = (
        "reservation__id",
        "first_name",
        "last_name",
        "document_number",
    )
    autocomplete_fields = (
        "reservation",
        "document_type",
    )


@admin.register(ReservationDeposit)
class ReservationDepositAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reservation",
        "deposit_date",
        "amount",
        "payment_method",
        "status",
        "reference",
        "created_at",
    )
    search_fields = (
        "reservation__id",
        "reference",
    )
    autocomplete_fields = (
        "reservation",
        "payment_method",
        "status",
    )


@admin.register(ReservationInventoryCheck)
class ReservationInventoryCheckAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "reservation",
        "check_type",
        "created_by",
        "created_at",
    )
    list_filter = (
        "check_type",
        "created_at",
    )
    search_fields = (
        "reservation__id",
        "notes",
    )
    autocomplete_fields = (
        "reservation",
        "created_by",
    )
    readonly_fields = ("created_at",)
    inlines = [ReservationInventoryCheckLineInline]


@admin.register(ReservationInventoryCheckLine)
class ReservationInventoryCheckLineAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "inventory_check",
        "room",
        "item",
        "expected_quantity",
        "reviewed_quantity",
        "difference_quantity",
        "created_at",
    )
    search_fields = (
        "inventory_check__reservation__id",
        "room__number",
        "item__name",
    )
    autocomplete_fields = (
        "inventory_check",
        "reservation_room",
        "room",
        "item",
    )
