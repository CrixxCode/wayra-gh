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
    legal_name?: string;
    slogan?: string;
    description?: string;
    logo?: string | null;
    stars?: number;

    // Redes sociales
    facebook?: string;
    instagram?: string;
    twitter_x?: string;

    // Ubicación
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;

    // Contacto
    primary_phone?: string;
    secondary_phone?: string;
    general_email?: string;
    reservations_email?: string;
    website?: string;

    // Operación
    check_in_time?: string;
    check_out_time?: string;
    max_guests_per_room?: number;

    // Configuración financiera
    currency?: string;
    tax_rate?: number;

    // Sistema
    system_language?: string;
    timezone?: string;

    // Estructura del hotel
    floors?: HotelFloor[];

    // Estadísticas calculadas
    total_floors?: number;
    total_rooms?: number;
    average_rooms_per_floor?: number;
}
