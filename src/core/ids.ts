/** Generates opaque, URL- and JSON-safe identifiers. */
export function newId(prefix = ''): string {
  const raw = globalThis.crypto.randomUUID().replace(/-/g, '');
  return prefix ? `${prefix}_${raw}` : raw;
}
