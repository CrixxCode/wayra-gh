import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Verificacion del enlace publico del hotel.
 *
 * Antes intentaba mostrar el sitio dentro de un iframe. En la practica eso falla con
 * muchos sitios perfectamente publicos --Facebook incluido-- porque bloquean ser
 * embebidos con X-Frame-Options o Content-Security-Policy. "Publico" significa que se
 * puede abrir en el navegador; no que otro sistema pueda meterlo dentro de su pagina.
 *
 * Por eso aqui verificamos lo que si podemos garantizar: la URL normalizada, el dominio
 * detectado y una apertura segura en pestaña nueva.
 */
@Component({
  selector: 'app-site-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './site-preview.html',
  styleUrls: ['./site-preview.css']
})
export class SitePreview {
  /** Lo que el usuario escribio, tal cual. */
  @Input() url = '';

  /** La URL normalizada, por si el formulario quiere guardarla asi. */
  @Output() normalized = new EventEmitter<string>();

  get resolvedUrl(): string | null {
    const raw = String(this.url || '').trim();
    if (!raw) return null;

    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

    try {
      const parsed = new URL(withScheme);
      if (!parsed.hostname.includes('.')) return null;
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  get isValid(): boolean {
    return this.resolvedUrl !== null;
  }

  get host(): string {
    const resolved = this.resolvedUrl;
    if (!resolved) return '';
    try {
      return new URL(resolved).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  get isEmpty(): boolean {
    return !String(this.url || '').trim();
  }

  get faviconUrl(): string {
    const resolved = this.resolvedUrl;
    if (!resolved) return '';

    const host = new URL(resolved).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  }

  applyNormalized(): void {
    const resolved = this.resolvedUrl;
    if (resolved && resolved !== this.url) this.normalized.emit(resolved);
  }

  openInNewTab(): void {
    const resolved = this.resolvedUrl;
    if (!resolved) return;

    this.applyNormalized();
    window.open(resolved, '_blank', 'noopener,noreferrer');
  }
}
