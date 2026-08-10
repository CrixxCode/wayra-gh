export type AmenityIconOption = {
  value: string;
  label: string;
};

/**
 * Debe coincidir con AMENITY_ICON_CATALOG de backend/apps/rooms/serializers.py.
 * El backend rechaza cualquier icono fuera de esta lista.
 */
export const AMENITY_ICON_CATALOG: AmenityIconOption[] = [
  { value: 'fa-solid fa-bed', label: 'Cama' },
  { value: 'fa-solid fa-wifi', label: 'WiFi' },
  { value: 'fa-solid fa-tv', label: 'TV' },
  { value: 'fa-solid fa-bath', label: 'Bano' },
  { value: 'fa-solid fa-snowflake', label: 'Aire' },
  { value: 'fa-solid fa-mug-hot', label: 'Cafe' },
  { value: 'fa-solid fa-square-parking', label: 'Parqueadero' },
  { value: 'fa-solid fa-water-ladder', label: 'Piscina' },
  { value: 'fa-solid fa-bell-concierge', label: 'Servicio' },
  { value: 'fa-solid fa-dumbbell', label: 'Gimnasio' }
];

export const DEFAULT_AMENITY_ICON = AMENITY_ICON_CATALOG[0].value;

export function isCatalogAmenityIcon(icon?: string | null): boolean {
  if (!icon) return false;
  return AMENITY_ICON_CATALOG.some((option) => option.value === icon);
}
