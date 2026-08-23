type IdentifierStyle = 'code' | 'slug';

interface IdentifierOptions {
  fallback?: string;
  maxLength?: number;
  style?: IdentifierStyle;
}

export function generateIdentifierFromText(value: unknown, options: IdentifierOptions = {}): string {
  const style = options.style || 'code';
  const separator = style === 'slug' ? '-' : '_';
  const fallback = options.fallback || (style === 'slug' ? 'item' : 'AUTO');

  const base = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, separator)
    .replace(new RegExp(`${escapeRegExp(separator)}+`, 'g'), separator)
    .replace(new RegExp(`^${escapeRegExp(separator)}|${escapeRegExp(separator)}$`, 'g'), '');

  const normalized = style === 'slug' ? base.toLowerCase() : base.toUpperCase();
  return trimIdentifier(normalized || fallback, options.maxLength);
}

export function makeUniqueIdentifier(
  value: unknown,
  existingValues: Iterable<unknown>,
  options: IdentifierOptions & { currentValue?: unknown } = {}
): string {
  const style = options.style || 'code';
  const separator = style === 'slug' ? '-' : '_';
  const maxLength = options.maxLength;
  const base = generateIdentifierFromText(value, options);
  const current = options.currentValue ? generateIdentifierFromText(options.currentValue, options) : '';
  const used = new Set(
    Array.from(existingValues)
      .map((item) => generateIdentifierFromText(item, options))
      .filter((item) => item && item !== current)
  );

  if (!used.has(base)) return base;

  for (let index = 2; index < 1000; index += 1) {
    const suffix = `${separator}${index}`;
    const stem = trimIdentifier(base, maxLength ? Math.max(1, maxLength - suffix.length) : undefined);
    const candidate = `${stem}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }

  return base;
}

function trimIdentifier(value: string, maxLength?: number): string {
  if (!maxLength || value.length <= maxLength) return value;
  return value.slice(0, maxLength).replace(/[-_]+$/g, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
