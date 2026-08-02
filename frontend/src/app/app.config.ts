import { ApplicationConfig, importProvidersFrom, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Lara from '@primeuix/themes/lara';
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AppTitleStrategy } from './app-title.strategy';
import { hotelContextInterceptor } from './interceptors/hotel-context.interceptor';

// ✅ PrimeNG modules para notificaciones y confirmaciones
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

export const appConfig: ApplicationConfig = {
  providers: [
    // ✅ Solo los módulos PrimeNG, no BrowserAnimationsModule
    importProvidersFrom(ToastModule, ConfirmDialogModule),

    // Configuración global
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(), // 👈 reemplaza a BrowserAnimationsModule

    provideHttpClient(
      withInterceptors([hotelContextInterceptor]),
      withXsrfConfiguration({
        cookieName: 'csrftoken',
        headerName: 'X-CSRFToken'
      })
    ),
    ConfirmationService,
    MessageService,
    { provide: TitleStrategy, useClass: AppTitleStrategy },

    // Tema PrimeNG (Aura)
    providePrimeNG({
      theme: {
        preset: Lara,
        options: {
          darkModeSelector: '.my-app-dark',
        }
      }
    })
  ]
};
