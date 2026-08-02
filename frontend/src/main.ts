import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import 'flowbite';

// main.ts
import { register } from 'swiper/element/bundle';
register(); // <- registra <swiper-container> y <swiper-slide>

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
