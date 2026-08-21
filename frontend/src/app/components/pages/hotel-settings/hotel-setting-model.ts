export interface HotelFloor {
    id?: number;
    floor_number: number;
    name: string;
    prefix: string;
    room_count: number;
    range_display?: string;
}

export interface HotelSettings {
    id?: number;

    // Información general
    hotel_name: string;
    reservation_code_prefix?: string;
    legal_name?: string;
    slogan?: string;
    description?: string;
    logo?: string | null;
    stars?: number;

    // Redes sociales
    facebook?: string;
    instagram?: string;
    twitter_x?: string;

    // Colores de marca (hex "#rrggbb"), compartidos por todos los usuarios del hotel.
    primary_color?: string;
    secondary_color?: string;

    // Ubicación
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    /** Punto exacto en el mapa. El backend los manda como texto decimal. */
    latitude?: string | number | null;
    longitude?: string | number | null;

    // Contacto
    primary_phone?: string;
    secondary_phone?: string;
    general_email?: string;
    reservations_email?: string;
    website?: string;

    // Operación
    check_in_time?: string;
    check_out_time?: string;

    // Configuración financiera
    currency?: string;
    tax_rate?: number;

    // Sistema
    timezone?: string;
    is_active?: boolean;

    // Estructura del hotel
    floors?: HotelFloor[];

    // Estadísticas calculadas
    total_floors?: number;
    total_rooms?: number;
    average_rooms_per_floor?: number;
}
