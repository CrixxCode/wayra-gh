import { registerLocaleData } from '@angular/common';
import localeEsCO from '@angular/common/locales/es-CO';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import 'flowbite';

// Sin esto, cualquier `| currency: 'COP':'symbol':'1.0-0':'es-CO'` lanza NG0701 y la
// celda queda **en blanco**: era la causa de que el consolidado de ingresos mostrara
// las columnas de dinero vacias. Falla en silencio, asi que registrarlo una vez aqui
// evita que vuelva a pasar en cualquier plantilla que use el pipe.
registerLocaleData(localeEsCO);

// main.ts
import { register } from 'swiper/element/bundle';
register(); // <- registra <swiper-container> y <swiper-slide>

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
