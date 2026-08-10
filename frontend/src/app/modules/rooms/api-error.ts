/**
 * Extrae el primer mensaje util de una respuesta de error de DRF.
 * El backend responde `{"detail": "..."}` o `{"campo": ["..."]}`.
 */
export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;

  const payload = (error as { error?: unknown }).error;
  if (!payload || typeof payload !== 'object') return fallback;

  const record = payload as Record<string, unknown>;

  const detail = record['detail'];
  if (typeof detail === 'string' && detail.trim()) return detail;

  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value) && value.length && typeof value[0] === 'string') return value[0];
  }

  return fallback;
}
