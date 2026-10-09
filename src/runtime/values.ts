import type { Value } from '../model/types';

/** Parses numeric text such as "12" or " 3.5 "; returns null when the text is not a finite number. */
export function parseNumeric(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Converts a value to a number following Scratch-like rules: booleans are 1/0 and numeric text is parsed. */
export function toNumberValue(v: Value): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return parseNumeric(v);
}

export function toText(v: Value): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return Number.isFinite(v) ? String(v) : 'NaN';
}

/** Booleans: true/false, numbers (non-zero), and the text values "true" / "false" / "0" / "" (case-insensitive). */
export function toBool(v: Value): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const t = v.trim().toLowerCase();
  return !(t === '' || t === 'false' || t === '0');
}

/** Equality with Scratch-like coercion: numeric text equals the number it represents. */
export function valuesEqual(a: Value, b: Value): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return toBool(a) === toBool(b);
  const na = toNumberValue(a);
  const nb = toNumberValue(b);
  if (na !== null && nb !== null && typeof a !== 'boolean' && typeof b !== 'boolean') return na === nb;
  return toText(a) === toText(b);
}

/** Converts a text typed into a variable value input: numeric text is stored as a number. */
export function normalizeStoredValue(v: Value): Value {
  if (typeof v === 'string') {
    const n = parseNumeric(v);
    if (n !== null) return n;
  }
  return v;
}

const HEX = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

/** Accepts #rgb or #rrggbb (with or without '#') and returns a normalised #rrggbb string, or null. */
export function normalizeHex(text: string): string | null {
  const m = HEX.exec(text.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}
