import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { AuthService, MeResponse, hasResourceScope, isEffectivePlatformAdmin } from './auth/auth';
import { HotelSettingsService } from './hotel-settings';
import { HotelSettings } from '../components/pages/hotel-settings/hotel-setting-model';

export interface HotelSetupStatus {
  shouldPrompt: boolean;
  settingsFound: boolean;
  canManageSettings: boolean;
  missingFields: string[];
}

const completeStatus = (canManageSettings = false): HotelSetupStatus => ({
  shouldPrompt: false,
  settingsFound: true,
  canManageSettings,
  missingFields: [],
});

@Injectable({ providedIn: 'root' })
export class HotelSetupStatusService {
  constructor(
    private authService: AuthService,
    private hotelSettingsService: HotelSettingsService,
  ) {}

  getCurrentStatus(): Observable<HotelSetupStatus> {
    return this.authService.getUserInfo().pipe(
      switchMap((user) => {
        if (!user?.username || isEffectivePlatformAdmin(user) || user.must_change_password) {
          return of(completeStatus());
        }

        const canManageSettings = this.canManageHotelSettings(user);

        return this.hotelSettingsService.getCurrentSettings().pipe(
          map((settings) => buildHotelSetupStatus(settings, canManageSettings)),
          catchError(() =>
            of({
              shouldPrompt: true,
              settingsFound: false,
              canManageSettings,
              missingFields: ['configuracion inicial del hotel'],
            }),
          ),
        );
      }),
      catchError(() => of(completeStatus())),
    );
  }

  private canManageHotelSettings(user: MeResponse): boolean {
    return (
      hasResourceScope(user, 'hotel_settings.write') || hasResourceScope(user, 'hotel-config.write')
    );
  }
}

export function buildHotelSetupStatus(
  settings: HotelSettings | null,
  canManageSettings = false,
): HotelSetupStatus {
  if (!settings) {
    return {
      shouldPrompt: true,
      settingsFound: false,
      canManageSettings,
      missingFields: ['configuracion inicial del hotel'],
    };
  }

  const requiredFields: Array<[keyof HotelSettings, string]> = [
    ['hotel_name', 'nombre comercial'],
    ['legal_name', 'razon social'],
    ['address', 'direccion'],
    ['country', 'pais'],
    ['state', 'departamento'],
    ['city', 'ciudad'],
    ['primary_phone', 'telefono'],
    ['general_email', 'correo general'],
    ['reservations_email', 'correo de reservas'],
    ['check_in_time', 'hora de check-in'],
    ['check_out_time', 'hora de check-out'],
  ];

  const missingFields = requiredFields
    .filter(([field]) => !hasValue(settings[field]))
    .map(([, label]) => label);

  const hasCoordinates = hasValue(settings.latitude) && hasValue(settings.longitude);
  if (!hasCoordinates) {
    missingFields.push('ubicacion en el mapa');
  }

  const totalRooms = Number(settings.total_rooms ?? 0);
  const hasRoomStructure =
    totalRooms > 0 || (settings.floors ?? []).some((floor) => Number(floor.room_count ?? 0) > 0);

  if (!hasRoomStructure) {
    missingFields.push('estructura de pisos y habitaciones');
  }

  return {
    shouldPrompt: missingFields.length > 0,
    settingsFound: true,
    canManageSettings,
    missingFields,
  };
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return Number.isFinite(value);
  return String(value).trim().length > 0;
}
