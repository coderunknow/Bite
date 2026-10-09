/**
 * Scratch-style value semantics used by operators and blocks.
 * - Numbers: non-numeric text becomes 0 (NaN is never produced).
 * - Booleans: "", "0", "false" (case-insensitive) and 0 are false; everything else is true.
 * - Equality and ordering are numeric when both operands look numeric, otherwise case-insensitive text.
 */
export type BiteValue = number | string | boolean;

export function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    return !(lower === '' || lower === 'false' || lower === '0');
  }
  return false;
}

export function toText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(Number(value.toFixed(10))) : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function looksNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed !== '' && Number.isFinite(Number(trimmed));
  }
  return false;
}

export function equalsValues(a: unknown, b: unknown): boolean {
  if (looksNumeric(a) && looksNumeric(b)) return toNumber(a) === toNumber(b);
  return toText(a).toLowerCase() === toText(b).toLowerCase();
}

/** Returns -1, 0 or 1. */
export function compareValues(a: unknown, b: unknown): number {
  if (looksNumeric(a) && looksNumeric(b)) {
    const x = toNumber(a);
    const y = toNumber(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  const x = toText(a).toLowerCase();
  const y = toText(b).toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Random value in [min, max]: an integer if both bounds are integers, otherwise a float. */
export function randomBetween(min: number, max: number, rng: () => number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (Number.isInteger(lo) && Number.isInteger(hi)) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }
  return lo + rng() * (hi - lo);
}
