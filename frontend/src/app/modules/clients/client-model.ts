export interface ClientI {
    id?: number;
    document_type: string;
    document_number: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    email: string;
    phone?: string;
    country?: string;
    client_type: 'VIP' | 'FRECUENTE' | 'REGULAR';
    stay_level?: 'VIP' | 'FRECUENTE' | 'REGULAR';
    total_stay_nights?: number;
    last_stay?: string | null;
    status: 'ACTIVO' | 'INACTIVO' | 'HUESPED_ACTUAL';
    created_at?: string;
}