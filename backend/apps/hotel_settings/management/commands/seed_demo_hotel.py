"""
Siembra un hotel de demostracion completo: "Hotel Wayra Demo", boutique urbano en Medellin.

Crea la configuracion del hotel, su estructura (pisos, tipos, tarifas, habitaciones con
amenidades), los catalogos comerciales (servicios, paquetes, promociones), metodos de pago,
politicas, inventario, clientes, usuarios por rol y seis meses de operacion: reservas
finalizadas con factura y pago, estadias en curso, llegadas futuras, cancelaciones y no-shows,
mas egresos, tareas de limpieza, ordenes de mantenimiento y trabajo periodico.

Todo pasa por los servicios reales del sistema (facturas, liquidacion de cancelaciones y
no-shows, sincronizacion de habitaciones), asi que los numeros cuadran entre pantallas. Las
fechas de pagos, facturas y consumos se llevan al dia en que ocurrieron para que Reportes y
Finanzas tengan historia.

Uso:
    python manage.py seed_demo_hotel                # crea el hotel (falla si ya existe)
    python manage.py seed_demo_hotel --months 12    # mas historia
    python manage.py seed_demo_hotel --hotel-name "Otro Demo" --username-prefix otro

No borra nada: si el hotel ya existe, se detiene. Es determinista (semilla fija), salvo
las contrasenas, que se generan y se muestran una sola vez al final.
"""

from __future__ import annotations

import random
import secrets
import string
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import Role, UserRole
from apps.billing.models import Charge, Invoice, Payment
from apps.billing.services import (
    issue_default_invoice_for_reservation,
    settle_billing_for_cancelled_reservation,
    settle_billing_for_no_show_reservation,
)
from apps.clients.models import Client
from apps.finance.models import Expense, FinancialControlConfig
from apps.hotel_settings.models import HotelFloor, HotelSettings, PaymentMethod, ReservationPolicy
from apps.inventory.models import Item, RoomInventory
from apps.master_data.models import MasterData
from apps.notifications.models import Notification
from apps.packages.models import Package, PackageService
from apps.promotions.models import Promotion
from apps.reservations.models import Reservation, ReservationGuest, ReservationRoom
from apps.reservations.services import get_reservation_financials, sync_all_room_statuses
from apps.rooms.models import Amenity, CleaningTask, MaintenanceOrder, Rate, RecurringWork, Room, RoomType
from apps.services.models import Service

User = get_user_model()

FIRST_NAMES = [
    "Valentina", "Santiago", "Mariana", "Sebastian", "Isabella", "Mateo", "Camila", "Samuel",
    "Daniela", "Alejandro", "Sofia", "Nicolas", "Laura", "Juan Pablo", "Gabriela", "Andres",
    "Paula", "Felipe", "Natalia", "David", "Manuela", "Esteban", "Juliana", "Carlos",
    "Emily", "James", "Lucia", "Marco", "Chloe", "Thomas", "Ana", "Diego",
]
LAST_NAMES = [
    "Restrepo", "Gomez", "Ramirez", "Mejia", "Arango", "Zapata", "Velez", "Ochoa", "Cardona",
    "Londono", "Garcia", "Henao", "Jaramillo", "Correa", "Uribe", "Montoya", "Smith", "Rossi",
    "Martin", "Fernandez", "Lopez", "Silva", "Bernal", "Castano",
]
# Usuario de la demo -> rol (de `seed_rbac` y `seed_extra_roles`).
ROLE_SLUGS = {"admin": "admin", "recepcion": "reception", "limpieza": "housekeeping", "mantenimiento": "maintenance"}

FOREIGN = [("US", "PASAPORTE"), ("ES", "PASAPORTE"), ("MX", "PASAPORTE"), ("AR", "DNI"), ("IT", "PASAPORTE")]


class Command(BaseCommand):
    help = "Crea un hotel de demostracion completo con seis meses de operacion."

    def add_arguments(self, parser):
        parser.add_argument("--hotel-name", default="Hotel Wayra Demo")
        parser.add_argument("--username-prefix", default="demo")
        parser.add_argument("--months", type=int, default=6)
        parser.add_argument("--seed", type=int, default=2026)

    # ------------------------------------------------------------------ entrada

    def handle(self, *args, **options):
        hotel_name = options["hotel_name"].strip()
        self.prefix = options["username_prefix"].strip().lower()
        self.months = max(0, int(options["months"]))
        self.rng = random.Random(options["seed"])
        self.today = timezone.localdate()

        if HotelSettings.objects.filter(hotel_name__iexact=hotel_name).exists():
            raise CommandError(f"Ya existe un hotel llamado '{hotel_name}'. Usa --hotel-name para crear otro.")
        taken = User.objects.filter(username__startswith=f"{self.prefix}.").values_list("username", flat=True)
        if taken:
            raise CommandError(
                f"Ya hay usuarios con el prefijo '{self.prefix}.' ({', '.join(taken[:4])}). Usa --username-prefix."
            )

        # No se llama a `seed_rbac` desde aqui: si no hay superusuario crea uno con clave
        # conocida, y eso no debe pasar en produccion como efecto lateral de sembrar un demo.
        missing = [slug for slug in ROLE_SLUGS.values() if not Role.objects.filter(slug=slug, is_active=True).exists()]
        if missing:
            raise CommandError(
                "Faltan roles (" + ", ".join(missing) + "). Corre antes 'python manage.py seed_rbac' "
                "y 'python manage.py seed_extra_roles'."
            )

        with transaction.atomic():
            self._catalogs()
            self.hotel = self._hotel(hotel_name)
            self.users = self._users()
            self._structure()
            self._commercial()
            self._payment_and_policies()
            self._inventory()
            self.clients = self._clients()
            self._reservations()
            self._operations()
            self._expenses()
            self._finance_config()
            sync_all_room_statuses()
            # Los avisos que dispararon las altas historicas no son "nuevos": la campana
            # arranca limpia y genera los del dia en la primera consulta.
            Notification.objects.filter(hotel_settings=self.hotel).delete()

        self._report()

    # --------------------------------------------------------------- catalogos

    def _md(self, group, code, name=None, sort_order=0):
        item, _ = MasterData.objects.get_or_create(
            group=group,
            code=code,
            defaults={"name": name or code.replace("_", " ").title(), "sort_order": sort_order, "is_active": True},
        )
        return item

    def _catalogs(self):
        G = MasterData.Group
        md = self._md
        self.room_available = md(G.ROOM_STATUS, "DISPONIBLE", "Disponible")
        self.room_out_of_service = md(G.ROOM_STATUS, "FUERA_DE_SERVICIO", "Fuera de servicio")
        self.st = {code: md(G.RESERVATION_STATUS, code) for code in ("PENDIENTE", "CONFIRMADA", "EN_CURSO", "FINALIZADA", "CANCELADA")}
        self.st["NO_SHOW"] = md(G.RESERVATION_STATUS, "NO_SHOW", "No se presento", 6)
        self.origins = {code: md(G.RESERVATION_ORIGIN, code) for code in ("WEB", "RECEPCION", "TELEFONO", "AGENCIA")}
        self.meal_breakfast = md(G.MEAL_PLAN, "DESAYUNO", "Desayuno")
        self.doc = {code: md(G.DOCUMENT_TYPE, code) for code in ("CC", "CE", "PASAPORTE", "DNI")}
        self.client_status = md(G.CLIENT_STATUS, "ACTIVO", "Activo")
        self.client_type = md(G.CLIENT_TYPE, "REGULAR", "Regular")
        for code in ("FRECUENTE", "VIP"):
            md(G.CLIENT_TYPE, code)
        self.charge_service = md(G.CHARGE_TYPE, "SERVICIO", "Servicio")
        self.service_types = {
            code: md(G.SERVICE_TYPE, code, name)
            for code, name in (
                ("SPA", "Spa y bienestar"), ("ALIMENTOS", "Alimentos y bebidas"),
                ("LAVANDERIA", "Lavanderia"), ("TRANSPORTE", "Transporte"), ("TOURS", "Tours"),
            )
        }
        self.pct = md(G.PROMOTION_DISCOUNT_TYPE, "PERCENTAGE", "Porcentaje")
        self.item_types = {code: md(G.ITEM_TYPE, code, name) for code, name in (("AMENITY", "Amenidad"), ("MINIBAR", "Minibar"), ("INSUMO", "Insumo"))}
        self.units = {code: md(G.UNIT_MEASURE, code, name) for code, name in (("UND", "Unidad"), ("PAQ", "Paquete"))}
        self.expense_categories = {
            code: md(G.EXPENSE_CATEGORY, code, name)
            for code, name in (
                ("NOMINA", "Nomina"), ("SERVICIOS_PUBLICOS", "Servicios publicos"), ("LAVANDERIA", "Lavanderia"),
                ("MANTENIMIENTO", "Mantenimiento"), ("INSUMOS", "Insumos"), ("MARKETING", "Marketing"),
                ("ARRIENDO", "Arriendo"),
            )
        }
        self.policy_types = {code: md(G.RESERVATION_POLICY_TYPE, code, name) for code, name in (("CANCELLATION", "Cancelacion"), ("CHECK_IN", "Check-in"), ("CHECK_OUT", "Check-out"))}
        self.penalties = {code: md(G.RESERVATION_PENALTY_TYPE, code, name) for code, name in (("PERCENTAGE", "Porcentaje"), ("NONE", "Sin penalidad"))}
        self.cleaning_types = {code: md(G.CLEANING_TASK_TYPE, code) for code in ("DIARIA", "SALIDA", "PROFUNDA", "INSPECCION")}
        self.cleaning_status = {code: md(G.CLEANING_STATUS, code) for code in ("PENDIENTE", "EN_PROCESO", "COMPLETADA")}
        self.priorities = {code: md(G.MAINTENANCE_PRIORITY, code) for code in ("BAJA", "MEDIA", "ALTA", "URGENTE")}
        self.maint_status = {code: md(G.MAINTENANCE_STATUS, code) for code in ("PENDIENTE", "EN_PROCESO", "COMPLETADA")}

    # ------------------------------------------------------------------ hotel

    def _hotel(self, name):
        return HotelSettings.objects.create(
            hotel_name=name,
            legal_name=f"{name} S.A.S.",
            slogan="Tu casa en el corazon de El Poblado",
            description=(
                "Hotel boutique de 18 habitaciones en El Poblado, a pasos del Parque Lleras y de la "
                "Milla de Oro. Spa, restaurante de cocina local y atencion personalizada 24 horas."
            ),
            stars=4,
            address="Carrera 37 # 8A-32, El Poblado",
            city="Medellin",
            state="Antioquia",
            country="Colombia",
            postal_code="050021",
            latitude=Decimal("6.208800"),
            longitude=Decimal("-75.568000"),
            primary_phone="+57 604 444 1234",
            secondary_phone="+57 300 555 0123",
            general_email="hola@wayra-demo.example.com",
            reservations_email="reservas@wayra-demo.example.com",
            website="https://wayra-demo.example.com",
            instagram="https://instagram.com/hotelwayrademo",
            facebook="https://facebook.com/hotelwayrademo",
            check_in_time=time(15, 0),
            check_out_time=time(12, 0),
            max_guests_per_room=4,
            currency="COP",
            tax_rate=Decimal("19.00"),
            system_language="es",
            timezone="America/Bogota",
            is_active=True,
        )

    def _users(self):
        self.passwords = {}
        specs = [
            ("admin", "Laura", "Mejia"),
            ("recepcion", "Andres", "Zapata"),
            ("limpieza", "Gloria", "Ochoa"),
            ("mantenimiento", "Hernan", "Cardona"),
        ]
        users = {}
        alphabet = string.ascii_letters + string.digits
        for key, first, last in specs:
            role_slug = ROLE_SLUGS[key]
            password = "Wayra-" + "".join(secrets.choice(alphabet) for _ in range(10))
            username = f"{self.prefix}.{key}"
            user = User.objects.create_user(
                username=username,
                email=f"{username}@wayra-demo.example.com",
                password=password,
                first_name=first,
                last_name=last,
                hotel_settings=self.hotel,
            )
            if hasattr(user, "must_change_password"):
                user.must_change_password = False
                user.save(update_fields=["must_change_password"])
            role = Role.objects.filter(slug=role_slug, is_active=True).first()
            if role:
                UserRole.objects.create(user=user, role=role, is_active=True)
            self.passwords[username] = (password, role.name if role else role_slug)
            users[key] = user
        return users

    # -------------------------------------------------------------- estructura

    def _structure(self):
        amenity = {
            name: Amenity.objects.get_or_create(name=name, defaults={"icon": icon, "is_active": True})[0]
            for name, icon in (
                ("WiFi", "fa-solid fa-wifi"), ("Smart TV", "fa-solid fa-tv"),
                ("Aire acondicionado", "fa-solid fa-snowflake"), ("Minibar", "fa-solid fa-wine-bottle"),
                ("Caja fuerte", "fa-solid fa-lock"), ("Escritorio", "fa-solid fa-laptop"),
                ("Balcon", "fa-solid fa-building"), ("Jacuzzi", "fa-solid fa-hot-tub-person"),
                ("Cafetera", "fa-solid fa-mug-hot"),
            )
        }
        base = ["WiFi", "Smart TV", "Aire acondicionado", "Caja fuerte"]
        specs = [
            # code, nombre, capacidad, camas, tipo de cama, tarifa, amenidades extra
            ("SEN", "Sencilla", 1, 1, "Semidoble", 185000, ["Escritorio", "Cafetera"]),
            ("DOB", "Doble superior", 2, 1, "Queen", 265000, ["Minibar", "Escritorio", "Cafetera"]),
            ("FAM", "Familiar", 4, 2, "Queen + 2 sencillas", 390000, ["Minibar", "Cafetera"]),
            ("SUI", "Suite El Poblado", 2, 1, "King", 460000, ["Minibar", "Balcon", "Jacuzzi", "Cafetera"]),
        ]
        self.room_types, self.rates = {}, {}
        for order, (code, name, capacity, beds, bed_type, price, extras) in enumerate(specs, start=1):
            room_type = RoomType.objects.create(
                hotel_settings=self.hotel, code=code, name=name, capacity=capacity, bed_count=beds,
                bed_type=bed_type, description=f"{name} con {bed_type.lower()}.", sort_order=order, is_active=True,
            )
            rate = Rate.objects.create(
                hotel_settings=self.hotel, room_type=room_type, name=f"Tarifa {name}", price=Decimal(price), is_active=True,
            )
            self.room_types[code] = (room_type, [amenity[n] for n in base + extras])
            self.rates[code] = rate

        layout = {
            1: ["SEN", "SEN", "SEN", "SEN", "DOB", "DOB"],
            2: ["DOB", "DOB", "DOB", "DOB", "FAM", "FAM"],
            3: ["SUI", "SUI", "SUI", "DOB", "DOB", "DOB"],
        }
        self.rooms = []
        for floor_number, codes in layout.items():
            floor = HotelFloor.objects.create(
                hotel_settings=self.hotel, floor_number=floor_number, name=f"Piso {floor_number}",
                prefix=str(floor_number), room_count=len(codes),
            )
            for index, code in enumerate(codes, start=1):
                room_type, amenities = self.room_types[code]
                room = Room.objects.create(
                    number=f"{floor_number}{index:02d}", floor=floor, room_type=room_type,
                    rate=self.rates[code], status=self.room_available,
                )
                room.amenities.set(amenities)
                self.rooms.append(room)
        # Una habitacion en remodelacion: muestra "Fuera de servicio" en el tablero.
        self.closed_room = self.rooms[-1]
        self.closed_room.status = self.room_out_of_service
        self.closed_room.notes = "Remodelacion del bano hasta fin de mes."
        self.closed_room.save(update_fields=["status", "notes"])

    # --------------------------------------------------------- catalogo comercial

    def _commercial(self):
        specs = [
            ("SPA", "Masaje relajante 60 min", 140000), ("SPA", "Circuito de spa", 90000),
            ("ALIMENTOS", "Desayuno buffet", 38000), ("ALIMENTOS", "Cena romantica", 220000),
            ("ALIMENTOS", "Room service", 55000), ("LAVANDERIA", "Lavanderia express", 30000),
            ("TRANSPORTE", "Traslado aeropuerto JMC", 110000), ("TOURS", "Tour Comuna 13", 85000),
            ("TOURS", "Tour del cafe en Santa Elena", 160000),
        ]
        self.services = {}
        for type_code, name, price in specs:
            self.services[name] = Service.objects.create(
                hotel_settings=self.hotel, service_type=self.service_types[type_code], name=name,
                description=f"{name}.", base_price=Decimal(price), is_active=True,
            )
        romantic = Package.objects.create(
            hotel_settings=self.hotel, room_type=self.room_types["SUI"][0], name="Escapada romantica",
            description="Suite, cena romantica y masaje para dos.", base_price=Decimal(620000), is_active=True,
        )
        for name, qty in (("Cena romantica", 1), ("Masaje relajante 60 min", 2)):
            PackageService.objects.create(package=romantic, service=self.services[name], quantity=qty, is_included=True)
        business = Package.objects.create(
            hotel_settings=self.hotel, room_type=self.room_types["DOB"][0], name="Viaje de negocios",
            description="Desayuno, lavanderia express y traslado al aeropuerto.", base_price=Decimal(160000), is_active=True,
        )
        for name in ("Desayuno buffet", "Lavanderia express", "Traslado aeropuerto JMC"):
            PackageService.objects.create(package=business, service=self.services[name], quantity=1, is_included=True)

        start = self.today - timedelta(days=30 * self.months)
        Promotion.objects.create(
            hotel_settings=self.hotel, discount_type=self.pct, name="Temporada baja",
            code="BAJA15", description="15 % sobre la estadia de lunes a jueves.", discount_value=Decimal(15),
            start_date=start, end_date=self.today + timedelta(days=120), is_active=True, is_public=True,
        )
        Promotion.objects.create(
            hotel_settings=self.hotel, discount_type=self.pct, service=self.services["Masaje relajante 60 min"],
            name="Spa de semana", code="SPA10", description="10 % en masajes.", discount_value=Decimal(10),
            start_date=start, end_date=self.today + timedelta(days=120), is_active=True, is_public=True,
        )

    def _payment_and_policies(self):
        # El efectivo lo siembra la senal de alta del hotel (`hotel_settings.signals`).
        cash = PaymentMethod.objects.filter(hotel_settings=self.hotel, method_type="EFECTIVO").first() or (
            PaymentMethod.objects.create(hotel_settings=self.hotel, name="Efectivo", method_type="EFECTIVO")
        )
        self.methods = [
            cash,
            PaymentMethod.objects.create(
                hotel_settings=self.hotel, name="Transferencia Bancolombia", method_type="TRANSFERENCIA",
                account_number="Ahorros 123-456789-01",
            ),
            PaymentMethod.objects.create(
                hotel_settings=self.hotel, name="Nequi", method_type="TRANSFERENCIA", account_number="300 555 0123",
            ),
        ]
        ReservationPolicy.objects.create(
            hotel_settings=self.hotel, policy_type=self.policy_types["CANCELLATION"], penalty_type=self.penalties["PERCENTAGE"],
            name="Cancelacion con 48 horas", penalty_value=Decimal(50), hours_before_checkin=48,
            description="Cancelando con menos de 48 horas se cobra el 50 % de la primera noche.",
        )
        ReservationPolicy.objects.create(
            hotel_settings=self.hotel, policy_type=self.policy_types["CHECK_IN"], penalty_type=self.penalties["NONE"],
            name="Check-in desde las 3:00 p. m.", description="Documento de identidad obligatorio para todos los huespedes.",
        )
        ReservationPolicy.objects.create(
            hotel_settings=self.hotel, policy_type=self.policy_types["CHECK_OUT"], penalty_type=self.penalties["NONE"],
            name="Check-out hasta las 12:00 m.", description="Salida tardia sujeta a disponibilidad.",
        )

    def _inventory(self):
        specs = [
            ("AMENITY", "UND", "Kit de shampoo y jabon", "ROOM", 240, 60, 400, 3500, 0),
            ("AMENITY", "UND", "Toalla de bano", "ROOM", 90, 40, 150, 28000, 45000),
            ("MINIBAR", "UND", "Agua sin gas 600 ml", "ROOM", 120, 40, 200, 1800, 6000),
            ("MINIBAR", "UND", "Cerveza artesanal", "ROOM", 70, 30, 150, 4500, 14000),
            ("MINIBAR", "UND", "Snack de mani", "ROOM", 35, 40, 120, 2500, 8000),  # bajo minimo
            ("INSUMO", "PAQ", "Papel de impresora", "RECEPTION", 12, 5, 30, 18000, 0),
        ]
        items = {}
        for type_code, unit, name, purpose, stock, minimum, maximum, cost, sale in specs:
            items[name] = Item.objects.create(
                hotel_settings=self.hotel, item_type=self.item_types[type_code], unit_measure=self.units[unit],
                name=name, sku=f"WD-{len(items) + 1:03d}", item_purpose=purpose, stock=stock, minimum_stock=minimum,
                maximum_stock=maximum, cost_price=Decimal(cost), sale_price=Decimal(sale), is_active=True,
            )
        for room in self.rooms:
            for name, quantity in (("Kit de shampoo y jabon", 2), ("Toalla de bano", 2), ("Agua sin gas 600 ml", 2)):
                RoomInventory.objects.create(room=room, item=items[name], quantity=quantity, minimum_quantity=1, is_active=True)
            if room.room_type.code in ("DOB", "SUI", "FAM"):
                RoomInventory.objects.create(room=room, item=items["Cerveza artesanal"], quantity=2, minimum_quantity=1, is_active=True)

    # ---------------------------------------------------------------- clientes

    def _clients(self):
        clients = []
        used = set()
        for index in range(70):
            first = self.rng.choice(FIRST_NAMES)
            last = f"{self.rng.choice(LAST_NAMES)} {self.rng.choice(LAST_NAMES)}"
            if self.rng.random() < 0.25:
                country, doc_code = self.rng.choice(FOREIGN)
                document = f"{self.rng.choice('ABCXYZ')}{self.rng.randint(1000000, 9999999)}"
            else:
                country, doc_code = "CO", "CC"
                document = str(self.rng.randint(10_000_000, 1_299_999_999))
            if document in used:
                continue
            used.add(document)
            slug = f"{first}.{last.split()[0]}{index}".lower().replace(" ", "")
            clients.append(
                Client.objects.create(
                    hotel_settings=self.hotel, document_type=self.doc[doc_code], document_number=document,
                    first_name=first, last_name=last, email=f"{slug}@example.com",
                    phone=f"+57 3{self.rng.randint(0, 2)}{self.rng.randint(0, 9)} {self.rng.randint(100, 999)} {self.rng.randint(1000, 9999)}",
                    country=country, client_type=self.client_type, status=self.client_status,
                )
            )
        return clients

    # ----------------------------------------------------------------- reservas

    def _aware(self, day: date, hour: int, minute: int = 0):
        return timezone.make_aware(datetime.combine(day, time(hour, minute)))

    def _reservations(self):
        self.counts = {key: 0 for key in ("FINALIZADA", "EN_CURSO", "CONFIRMADA", "PENDIENTE", "CANCELADA", "NO_SHOW")}
        start = self.today - timedelta(days=30 * self.months)
        end = self.today + timedelta(days=40)
        bookable = [room for room in self.rooms if room != self.closed_room]
        for room in bookable:
            cursor = start + timedelta(days=self.rng.randint(0, 3))
            while cursor < end:
                nights = self.rng.choice([1, 1, 2, 2, 2, 3, 3, 4, 5])
                check_in, check_out = cursor, cursor + timedelta(days=nights)
                self._one_reservation(room, check_in, check_out)
                # ~65 % de ocupacion en lo pasado; hacia adelante las reservas se van
                # espaciando, como en un hotel real (se reserva cada vez menos lejos).
                gap = self.rng.choice([0, 1, 1, 2, 2, 3, 4, 6])
                if check_out > self.today:
                    gap += (check_out - self.today).days // 6
                cursor = check_out + timedelta(days=gap)

    def _one_reservation(self, room, check_in, check_out):
        rng = self.rng
        client = rng.choice(self.clients)
        capacity = room.room_type.capacity
        adults = max(1, min(capacity, rng.choice([1, 2, 2, 2, 3, 4])))
        past = check_out <= self.today
        in_house = check_in <= self.today < check_out
        roll = rng.random()
        if past:
            outcome = "CANCELADA" if roll < 0.06 else ("NO_SHOW" if roll < 0.09 else "FINALIZADA")
        elif in_house:
            outcome = "EN_CURSO"
        else:
            outcome = "CANCELADA" if roll < 0.05 else ("PENDIENTE" if roll < 0.25 else "CONFIRMADA")

        created_day = check_in - timedelta(days=rng.randint(2, 40))
        reservation = Reservation.objects.create(
            client=client, hotel_settings=self.hotel, status=self.st["CONFIRMADA"],
            origin=rng.choice(list(self.origins.values())),
            expected_check_in=check_in, expected_check_out=check_out,
            created_by=self.users["recepcion"],
        )
        ReservationRoom.objects.create(
            reservation=reservation, room=room, night_rate=self.rates[room.room_type.code].price,
            adults=adults, children=0, meal_plan=self.meal_breakfast if rng.random() < 0.6 else None,
        )
        ReservationGuest.objects.create(
            reservation=reservation, document_type=client.document_type, document_number=client.document_number,
            first_name=client.first_name, last_name=client.last_name, email=client.email, phone=client.phone,
            nationality=client.country, accepts_data_policy=True,
        )
        Reservation.objects.filter(pk=reservation.pk).update(created_at=self._aware(created_day, 10))
        reservation.refresh_from_db()

        if outcome in ("FINALIZADA", "EN_CURSO"):
            self._consumption(reservation, check_in, min(check_out, self.today))
        invoice = issue_default_invoice_for_reservation(reservation.id, expected_hotel_settings_id=self.hotel.id)
        if invoice:
            Invoice.objects.filter(pk=invoice.pk).update(created_at=self._aware(created_day, 10), issue_date=self._aware(created_day, 10))

        total = get_reservation_financials(reservation)["total_amount"]
        if outcome == "FINALIZADA":
            self._pay(invoice, total * Decimal("0.3"), created_day) if rng.random() < 0.4 else None
            pending = get_reservation_financials(reservation)["pending_amount"]
            self._pay(invoice, pending, check_out)
            Reservation.objects.filter(pk=reservation.pk).update(
                status=self.st["FINALIZADA"], real_check_in=self._aware(check_in, 15, 30),
                real_check_out=self._aware(check_out, 11, 15),
            )
        elif outcome == "EN_CURSO":
            self._pay(invoice, (total * Decimal("0.5")).quantize(Decimal("1")), check_in)
            Reservation.objects.filter(pk=reservation.pk).update(
                status=self.st["EN_CURSO"], real_check_in=self._aware(check_in, 15, 30),
            )
        elif outcome == "CONFIRMADA":
            if rng.random() < 0.5:
                self._pay(invoice, (total * Decimal("0.3")).quantize(Decimal("1")), created_day)
        elif outcome == "PENDIENTE":
            Reservation.objects.filter(pk=reservation.pk).update(status=self.st["PENDIENTE"])
        elif outcome == "CANCELADA":
            Reservation.objects.filter(pk=reservation.pk).update(status=self.st["CANCELADA"])
            reservation.refresh_from_db()
            settle_billing_for_cancelled_reservation(reservation)
        elif outcome == "NO_SHOW":
            if rng.random() < 0.5:
                self._pay(invoice, (total * Decimal("0.3")).quantize(Decimal("1")), created_day)
            Reservation.objects.filter(pk=reservation.pk).update(status=self.st["NO_SHOW"])
            reservation.refresh_from_db()
            settle_billing_for_no_show_reservation(reservation)
        self.counts[outcome] += 1

        if outcome in ("FINALIZADA", "EN_CURSO"):
            nights = (min(check_out, self.today) - check_in).days
            client.total_stay_nights = int(client.total_stay_nights or 0) + max(nights, 1)
            client.last_stay = check_in
            client.save()

    def _consumption(self, reservation, start, end):
        options = ["Desayuno buffet", "Room service", "Lavanderia express", "Masaje relajante 60 min", "Tour Comuna 13", "Traslado aeropuerto JMC"]
        for _ in range(self.rng.choice([0, 1, 1, 2, 3])):
            service = self.services[self.rng.choice(options)]
            quantity = self.rng.choice([1, 1, 2])
            charge = Charge.objects.create(
                reservation=reservation, charge_type=self.charge_service, service=service,
                description=service.name, quantity=quantity, unit_price=service.base_price, is_active=True,
            )
            span = max((end - start).days, 1)
            day = start + timedelta(days=self.rng.randint(0, span - 1))
            Charge.objects.filter(pk=charge.pk).update(charge_date=self._aware(day, 19))

    def _pay(self, invoice, amount, day):
        amount = Decimal(amount).quantize(Decimal("1"))
        if not invoice or amount <= 0:
            return
        payment = Payment.objects.create(
            invoice=invoice, payment_method=self.rng.choice(self.methods), amount=amount,
            reference=f"WD-{self.rng.randint(100000, 999999)}", is_active=True, created_by=self.users["recepcion"],
        )
        Payment.objects.filter(pk=payment.pk).update(payment_date=self._aware(min(day, self.today), 11), created_at=self._aware(min(day, self.today), 11))

    # --------------------------------------------------------------- operacion

    def _operations(self):
        housekeeper, technician = self.users["limpieza"], self.users["mantenimiento"]
        departures = Reservation.objects.filter(hotel_settings=self.hotel, expected_check_out=self.today, status=self.st["EN_CURSO"])
        for reservation in departures:
            room = reservation.rooms_detail.first().room
            CleaningTask.objects.create(
                room=room, task_type=self.cleaning_types["SALIDA"], status=self.cleaning_status["PENDIENTE"],
                priority=self.priorities["ALTA"], scheduled_for=self.today, assigned_to=housekeeper,
                notes="Salida de hoy: revisar minibar.",
            )
        in_house = Reservation.objects.filter(hotel_settings=self.hotel, status=self.st["EN_CURSO"])[:3]
        for reservation in in_house:
            CleaningTask.objects.create(
                room=reservation.rooms_detail.first().room, task_type=self.cleaning_types["DIARIA"],
                status=self.cleaning_status["EN_PROCESO"], scheduled_for=self.today, assigned_to=housekeeper,
            )
        for days_ago in (3, 9, 16):
            task = CleaningTask.objects.create(
                room=self.rng.choice(self.rooms[:-1]), task_type=self.cleaning_types["PROFUNDA"],
                status=self.cleaning_status["COMPLETADA"], scheduled_for=self.today - timedelta(days=days_ago),
                completed_at=self._aware(self.today - timedelta(days=days_ago), 14), assigned_to=housekeeper,
                notes="Limpieza profunda mensual.",
            )
            CleaningTask.objects.filter(pk=task.pk).update(created_at=self._aware(self.today - timedelta(days=days_ago), 8))

        MaintenanceOrder.objects.create(
            room=self.rooms[9], title="Fuga en la llave de la ducha", description="El huesped reporta goteo constante.",
            priority=self.priorities["URGENTE"], status=self.maint_status["PENDIENTE"], assigned_to=technician,
        )
        MaintenanceOrder.objects.create(
            room=self.rooms[3], title="Cambiar bombillo de la lampara", priority=self.priorities["BAJA"],
            status=self.maint_status["EN_PROCESO"], assigned_to=technician,
        )
        MaintenanceOrder.objects.create(
            room=self.closed_room, title="Remodelacion del bano", description="Cambio de enchape y griferia.",
            priority=self.priorities["MEDIA"], status=self.maint_status["EN_PROCESO"],
            estimated_completed_at=self._aware(self.today + timedelta(days=12), 17),
        )
        for days_ago, title in ((20, "Revision del aire acondicionado"), (45, "Ajuste de la puerta del balcon")):
            MaintenanceOrder.objects.create(
                room=self.rng.choice(self.rooms[:-1]), title=title, priority=self.priorities["MEDIA"],
                status=self.maint_status["COMPLETADA"], completed_at=self._aware(self.today - timedelta(days=days_ago), 16),
                assigned_to=technician,
            )

        RecurringWork.objects.create(
            hotel_settings=self.hotel, kind="CLEANING", name="Inspeccion semanal del piso 3",
            task_type=self.cleaning_types["INSPECCION"], frequency="WEEKLY", interval=1,
            weekday=self.today.weekday(), starts_on=self.today, next_run_on=self.today + timedelta(days=7), is_active=True,
        )
        RecurringWork.objects.create(
            hotel_settings=self.hotel, kind="MAINTENANCE", name="Mantenimiento preventivo de aires",
            priority=self.priorities["MEDIA"], frequency="MONTHLY", interval=1, day_of_month=min(self.today.day, 28),
            starts_on=self.today, next_run_on=self.today + timedelta(days=30), is_active=True,
        )

    def _expenses(self):
        monthly = [
            ("NOMINA", "Nomina del personal", 32_000_000, "ADMIN_EXPENSE", "FIXED", "Nomina"),
            ("ARRIENDO", "Arriendo del edificio", 18_000_000, "ADMIN_EXPENSE", "FIXED", "Inmobiliaria Poblado"),
            ("SERVICIOS_PUBLICOS", "Energia, agua y gas", 4_200_000, "OPERATING_COST", "VARIABLE", "EPM"),
            ("LAVANDERIA", "Lavanderia de lenceria", 2_600_000, "OPERATING_COST", "VARIABLE", "Lavanderia Industrial Envigado"),
            ("INSUMOS", "Amenidades y minibar", 3_100_000, "OPERATING_COST", "VARIABLE", "Distribuidora Antioquia"),
            ("MARKETING", "Pauta en redes y OTAs", 1_800_000, "SALES_EXPENSE", "VARIABLE", "Meta Ads"),
        ]
        for month_back in range(self.months, -1, -1):
            first = (self.today.replace(day=1) - timedelta(days=30 * month_back)).replace(day=1)
            for code, concept, amount, expense_type, behavior, supplier in monthly:
                day = first + timedelta(days=self.rng.randint(0, 25))
                if day > self.today:
                    continue
                variation = Decimal(self.rng.uniform(0.9, 1.12)).quantize(Decimal("0.01"))
                Expense.objects.create(
                    hotel_settings=self.hotel, expense_category=self.expense_categories[code],
                    payment_method=self.methods[1], concept=concept,
                    amount=(Decimal(amount) * variation).quantize(Decimal("1")), expense_date=day,
                    expense_type=expense_type, cost_behavior=behavior, supplier_name=supplier, is_active=True,
                )
            if month_back % 2 == 0:
                Expense.objects.create(
                    hotel_settings=self.hotel, expense_category=self.expense_categories["MANTENIMIENTO"],
                    payment_method=self.methods[0], concept="Repuestos y mano de obra",
                    amount=Decimal(self.rng.randint(600_000, 1_900_000)), expense_date=min(first + timedelta(days=14), self.today),
                    expense_type="OPERATING_COST", cost_behavior="VARIABLE", supplier_name="Ferreteria El Poblado", is_active=True,
                )

    def _finance_config(self):
        FinancialControlConfig.objects.get_or_create(hotel_settings=self.hotel, defaults={"district_name": "Medellin"})

    # ------------------------------------------------------------------ informe

    def _report(self):
        out = self.stdout
        out.write(self.style.SUCCESS(f"\nHotel creado: {self.hotel.hotel_name} (id {self.hotel.id})"))
        out.write(f"  Habitaciones: {len(self.rooms)} (una fuera de servicio) · Clientes: {len(self.clients)}")
        out.write("  Reservas: " + ", ".join(f"{k.lower()} {v}" for k, v in self.counts.items()))
        out.write(f"  Egresos: {Expense.objects.filter(hotel_settings=self.hotel).count()}")
        out.write(self.style.WARNING("\nUsuarios (guarda estas contrasenas: no se vuelven a mostrar):"))
        for username, (password, role) in self.passwords.items():
            out.write(f"  {username:<24} {password:<20} {role}")
        out.write("")
