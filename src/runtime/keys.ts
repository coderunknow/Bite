import { SUPPORTED_KEYS } from '../model/types';

const SUPPORTED = new Set<string>(SUPPORTED_KEYS);

const SPECIAL: Record<string, string> = {
  ' ': 'space',
  Spacebar: 'space',
  Enter: 'enter',
  ArrowUp: 'up arrow',
  ArrowDown: 'down arrow',
  ArrowLeft: 'left arrow',
  ArrowRight: 'right arrow',
  Shift: 'shift',
};

/** Maps a DOM KeyboardEvent.key value to a supported project key name, or null when the key is not supported. */
export function normalizeKey(domKey: string): string | null {
  const mapped = SPECIAL[domKey] ?? (domKey.length === 1 ? domKey.toLowerCase() : domKey);
  return SUPPORTED.has(mapped) && mapped !== 'any' ? mapped : null;
}
