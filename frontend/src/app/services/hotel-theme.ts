import { Injectable } from '@angular/core';

export const DEFAULT_PRIMARY_COLOR = '#0f1f41';
export const DEFAULT_SECONDARY_COLOR = '#112853';

/**
 * Aplica los colores de marca del hotel (guardados en `HotelSettings`, ver AGENTS.md 5.4)
 * a las variables CSS que usa toda la app. Centralizado aqui porque tanto el header
 * (aplica el color del hotel del usuario en cada carga) como Configuracion del Hotel
 * (vista previa mientras se elige el color) necesitan la misma normalizacion y el mismo
 * calculo de contraste.
 */
@Injectable({ providedIn: 'root' })
export class HotelThemeService {
  normalizeColor(value: string | null | undefined, fallback: string): string {
    const candidate = String(value || '').trim();
    return /^#[\da-fA-F]{6}$/.test(candidate) ? candidate.toLowerCase() : fallback;
  }

  /** Negro o blanco segun cual quede legible sobre `hexColor` (WCAG relative luminance). */
  resolveOnBrandColor(hexColor: string): string {
    const normalized = this.normalizeColor(hexColor, DEFAULT_PRIMARY_COLOR).slice(1);
    const red = parseInt(normalized.slice(0, 2), 16) / 255;
    const green = parseInt(normalized.slice(2, 4), 16) / 255;
    const blue = parseInt(normalized.slice(4, 6), 16) / 255;

    const linearize = (channel: number): number =>
      channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

    const luminance = 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
    return luminance > 0.45 ? '#0f172a' : '#ffffff';
  }

  applyBrandColors(primary: string | null | undefined, secondary: string | null | undefined): void {
    if (typeof document === 'undefined') return;

    const normalizedPrimary = this.normalizeColor(primary, DEFAULT_PRIMARY_COLOR);
    const normalizedSecondary = this.normalizeColor(secondary, DEFAULT_SECONDARY_COLOR);

    const root = document.documentElement;
    root.style.setProperty('--gh-brand', normalizedPrimary);
    root.style.setProperty('--gh-brand-hover', normalizedSecondary);
    root.style.setProperty('--gh-brand-secondary', normalizedSecondary);
    root.style.setProperty('--gh-on-brand', this.resolveOnBrandColor(normalizedPrimary));
  }
}
