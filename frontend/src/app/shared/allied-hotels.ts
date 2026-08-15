export interface AlliedHotel {
  slug: string;
  name: string;
  type: string;
  city: string;
  department: string;
  country: string;
  description: string;
  highlights: string[];
  rooms: number;
  maxGuestsPerRoom: number;
  nightlyRateFrom: number;
  roomRates: AlliedRoomRate[];
  contact: string;
}

export interface AlliedRoomRate {
  id: string;
  roomType: string;
  rateName: string;
  description: string;
  maxGuests: number;
  nightlyRate: number;
}

export const ALLIED_HOTELS: AlliedHotel[] = [
  {
    slug: 'hotel-casa-aurora',
    name: 'Hotel Casa Aurora',
    type: 'Hotel',
    city: 'Bogota',
    department: 'Cundinamarca',
    country: 'Colombia',
    description:
      'Alojamiento urbano con habitaciones estandar y superiores cerca del centro.',
    highlights: [
      'Recepcion 24 horas',
      'Desayuno incluido',
      'Wi-Fi para huespedes',
    ],
    rooms: 42,
    maxGuestsPerRoom: 3,
    nightlyRateFrom: 185000,
    roomRates: [
      {
        id: 'standard-flex',
        roomType: 'Habitacion estandar',
        rateName: 'Flexible',
        description: 'Tarifa base con cambios sujetos a disponibilidad.',
        maxGuests: 2,
        nightlyRate: 185000,
      },
      {
        id: 'superior-breakfast',
        roomType: 'Habitacion superior',
        rateName: 'Con desayuno',
        description: 'Habitacion superior para parejas o viaje corporativo.',
        maxGuests: 3,
        nightlyRate: 245000,
      },
    ],
    contact: 'reservas@casaaurora.co',
  },
  {
    slug: 'hostal-sendero-azul',
    name: 'Hostal Sendero Azul',
    type: 'Hostal',
    city: 'Medellin',
    department: 'Antioquia',
    country: 'Colombia',
    description:
      'Espacios compartidos y privados pensados para estadias cortas.',
    highlights: [
      'Cocina compartida',
      'Zona social',
      'Check-in flexible',
    ],
    rooms: 18,
    maxGuestsPerRoom: 2,
    nightlyRateFrom: 95000,
    roomRates: [
      {
        id: 'shared-bed',
        roomType: 'Cama en habitacion compartida',
        rateName: 'No reembolsable',
        description: 'Cama individual en dormitorio compartido.',
        maxGuests: 1,
        nightlyRate: 95000,
      },
      {
        id: 'private-room',
        roomType: 'Habitacion privada',
        rateName: 'Flexible',
        description: 'Habitacion privada sencilla para estancias cortas.',
        maxGuests: 2,
        nightlyRate: 165000,
      },
    ],
    contact: 'hola@senderoazul.co',
  },
  {
    slug: 'apartahotel-vista-norte',
    name: 'Apartahotel Vista Norte',
    type: 'Apartahotel',
    city: 'Cali',
    department: 'Valle del Cauca',
    country: 'Colombia',
    description:
      'Apartamentos con cocina equipada para estadias prolongadas.',
    highlights: [
      'Cocina equipada',
      'Lavanderia',
      'Tarifas por temporada',
    ],
    rooms: 27,
    maxGuestsPerRoom: 4,
    nightlyRateFrom: 230000,
    roomRates: [
      {
        id: 'studio',
        roomType: 'Apartamento tipo estudio',
        rateName: 'Semanal flexible',
        description: 'Estudio con cocina equipada para dos personas.',
        maxGuests: 2,
        nightlyRate: 230000,
      },
      {
        id: 'family-apartment',
        roomType: 'Apartamento familiar',
        rateName: 'Estadia prolongada',
        description: 'Apartamento amplio con cocina y sala independiente.',
        maxGuests: 4,
        nightlyRate: 340000,
      },
    ],
    contact: 'contacto@vistanorte.co',
  },
  {
    slug: 'hotel-brisa-del-rio',
    name: 'Hotel Brisa del Rio',
    type: 'Hotel',
    city: 'Barranquilla',
    department: 'Atlantico',
    country: 'Colombia',
    description:
      'Hotel corporativo con salones de reunion y facil acceso empresarial.',
    highlights: [
      'Salones de reunion',
      'Parqueadero',
      'Restaurante',
    ],
    rooms: 64,
    maxGuestsPerRoom: 3,
    nightlyRateFrom: 210000,
    roomRates: [
      {
        id: 'business-standard',
        roomType: 'Habitacion ejecutiva',
        rateName: 'Corporativa',
        description: 'Habitacion ejecutiva con escritorio de trabajo.',
        maxGuests: 2,
        nightlyRate: 210000,
      },
      {
        id: 'business-plus',
        roomType: 'Habitacion ejecutiva plus',
        rateName: 'Con desayuno',
        description: 'Incluye desayuno y mayor espacio de trabajo.',
        maxGuests: 3,
        nightlyRate: 285000,
      },
    ],
    contact: 'reservas@brisadelrio.co',
  },
  {
    slug: 'posada-monte-claro',
    name: 'Posada Monte Claro',
    type: 'Alojamiento turistico',
    city: 'Salento',
    department: 'Quindio',
    country: 'Colombia',
    description:
      'Posada tranquila para viajeros que buscan naturaleza y descanso.',
    highlights: [
      'Tours locales',
      'Vista a la montana',
      'Desayuno campesino',
    ],
    rooms: 16,
    maxGuestsPerRoom: 3,
    nightlyRateFrom: 145000,
    roomRates: [
      {
        id: 'mountain-room',
        roomType: 'Habitacion vista montana',
        rateName: 'Flexible',
        description: 'Habitacion tranquila con desayuno campesino.',
        maxGuests: 2,
        nightlyRate: 145000,
      },
      {
        id: 'triple-cabin',
        roomType: 'Cabana triple',
        rateName: 'Experiencia local',
        description: 'Cabana para grupo pequeno con tour local incluido.',
        maxGuests: 3,
        nightlyRate: 230000,
      },
    ],
    contact: 'info@monteclaro.co',
  },
  {
    slug: 'suite-marina-73',
    name: 'Suite Marina 73',
    type: 'Apartahotel',
    city: 'Cartagena',
    department: 'Bolivar',
    country: 'Colombia',
    description:
      'Suites amobladas cerca de la zona turistica para viajes familiares.',
    highlights: [
      'Suites familiares',
      'Piscina',
      'Cerca al mar',
    ],
    rooms: 31,
    maxGuestsPerRoom: 5,
    nightlyRateFrom: 320000,
    roomRates: [
      {
        id: 'suite-standard',
        roomType: 'Suite estandar',
        rateName: 'Flexible',
        description: 'Suite amoblada para parejas o viaje familiar corto.',
        maxGuests: 3,
        nightlyRate: 320000,
      },
      {
        id: 'suite-family',
        roomType: 'Suite familiar',
        rateName: 'Familiar con desayuno',
        description: 'Suite amplia cerca al mar para grupos familiares.',
        maxGuests: 5,
        nightlyRate: 460000,
      },
    ],
    contact: 'reservas@suitemarina73.co',
  },
];
