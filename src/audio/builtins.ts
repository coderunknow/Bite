/**
 * Built-in sounds are synthesized here and stored as WAV assets, so they travel inside exported
 * projects like any imported sound. No sample library or remote service is used.
 */
import { encodeWav, SAMPLE_RATE } from './wav';

export interface BuiltinSound {
  id: string;
  name: string;
  description: string;
  durationSeconds: number;
  render: (sampleRate: number) => Float32Array;
}

function fill(seconds: number, sampleRate: number, fn: (t: number, n: number) => number): Float32Array {
  const n = Math.max(1, Math.round(seconds * sampleRate));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = fn(i / sampleRate, i / n);
  return out;
}

const envelope = (t: number, attack: number, release: number, total: number) => {
  const a = Math.min(1, t / attack);
  const r = Math.min(1, Math.max(0, (total - t) / release));
  return Math.min(a, r);
};

export const BUILTIN_SOUNDS: BuiltinSound[] = [
  {
    id: 'builtin-pop',
    name: 'Pop',
    description: 'Short rising pop',
    durationSeconds: 0.25,
    render: (sr) =>
      fill(0.25, sr, (t, _n) => {
        const f = 300 + 900 * t * 4;
        return 0.7 * Math.sin(2 * Math.PI * f * t) * envelope(t, 0.005, 0.15, 0.25);
      }),
  },
  {
    id: 'builtin-chime',
    name: 'Chime',
    description: 'Two-tone bell chime',
    durationSeconds: 1.2,
    render: (sr) =>
      fill(1.2, sr, (t) => {
        const env = Math.exp(-3.2 * t);
        return 0.4 * env * (Math.sin(2 * Math.PI * 880 * t) + 0.5 * Math.sin(2 * Math.PI * 1320 * t)) * envelope(t, 0.003, 0.3, 1.2);
      }),
  },
  {
    id: 'builtin-click',
    name: 'Click',
    description: 'Dry tick',
    durationSeconds: 0.06,
    render: (sr) =>
      fill(0.06, sr, (t) => {
        const noise = Math.sin(t * 12345.678) * Math.sin(t * 6789.1);
        return 0.8 * noise * Math.exp(-80 * t);
      }),
  },
  {
    id: 'builtin-boom',
    name: 'Boom',
    description: 'Low falling thump',
    durationSeconds: 0.9,
    render: (sr) =>
      fill(0.9, sr, (t) => {
        const f = 120 * Math.exp(-4 * t) + 30;
        return 0.9 * Math.sin(2 * Math.PI * f * t) * Math.exp(-3.5 * t) * envelope(t, 0.002, 0.2, 0.9);
      }),
  },
  {
    id: 'builtin-beep',
    name: 'Beep',
    description: 'Short square-wave beep',
    durationSeconds: 0.2,
    render: (sr) =>
      fill(0.2, sr, (t) => {
        const s = Math.sin(2 * Math.PI * 660 * t) >= 0 ? 1 : -1;
        return 0.25 * s * envelope(t, 0.005, 0.05, 0.2);
      }),
  },
];

export function renderBuiltinWav(sound: BuiltinSound, sampleRate = SAMPLE_RATE): Uint8Array {
  return encodeWav(sound.render(sampleRate), sampleRate);
}
