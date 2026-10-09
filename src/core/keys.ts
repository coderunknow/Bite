/** Keyboard key names used by "when key pressed" and "key pressed?" blocks. */
export const ANY_KEY = 'any key';

export const KEY_OPTIONS: ReadonlyArray<readonly [label: string, value: string]> = [
  ['any key', ANY_KEY],
  ['space', 'space'],
  ['up arrow', 'up arrow'],
  ['down arrow', 'down arrow'],
  ['left arrow', 'left arrow'],
  ['right arrow', 'right arrow'],
  ['enter', 'enter'],
  ['shift', 'shift'],
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c, c] as const),
  ...'0123456789'.split('').map((c) => [c, c] as const),
];

const SPECIAL: Record<string, string> = {
  ' ': 'space',
  Spacebar: 'space',
  ArrowUp: 'up arrow',
  ArrowDown: 'down arrow',
  ArrowLeft: 'left arrow',
  ArrowRight: 'right arrow',
  Enter: 'enter',
  Shift: 'shift',
};

/** Maps a DOM KeyboardEvent.key value to a Bite key name. Returns null for unsupported keys. */
export function normalizeKey(key: string): string | null {
  if (key in SPECIAL) return SPECIAL[key];
  if (key.length === 1) {
    const lower = key.toLowerCase();
    if ((lower >= 'a' && lower <= 'z') || (lower >= '0' && lower <= '9')) return lower;
  }
  return null;
}
