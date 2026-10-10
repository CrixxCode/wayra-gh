import { HttpResponse } from '@angular/common/http';

/**
 * Guarda un archivo que devolvio el backend (exportes PDF/Excel, auditoria Bloque 11 #6-7).
 * El nombre sale de `Content-Disposition`; si no viene, se usa `fallbackName`.
 */
export function saveHttpBlob(response: HttpResponse<Blob>, fallbackName: string): void {
  const blob = response.body;
  if (!blob) return;
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] || fallbackName;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportOutput = 'pdf' | 'xlsx';
