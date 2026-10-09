import { describe, it, expect } from 'vitest';
import { encodeWav, readWavHeader, SAMPLE_RATE } from '../../src/audio/wav';
import { BUILTIN_SOUNDS, renderBuiltinWav } from '../../src/audio/builtins';
import { assertPlayableAudio, MAX_SOUND_BYTES } from '../../src/audio/validate';
import { WebAudioHost } from '../../src/audio/webAudioHost';

describe('WAV encoding', () => {
  it('writes 16-bit mono PCM at the project sample rate with a valid header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const bytes = encodeWav(samples);
    const header = readWavHeader(bytes);
    expect(header).toEqual({ sampleRate: SAMPLE_RATE, channels: 1, bits: 16, frames: 5 });
    expect(bytes.byteLength).toBe(44 + 5 * 2);
  });

  it('clamps out-of-range samples instead of wrapping', () => {
    const bytes = encodeWav(new Float32Array([5, -5]));
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });

  it('readWavHeader returns null for anything that is not a WAV file', () => {
    expect(readWavHeader(new TextEncoder().encode('ID3 this is an mp3'))).toBeNull();
    expect(readWavHeader(new Uint8Array(4))).toBeNull();
  });
});

describe('built-in sounds', () => {
  it('ship five generated sounds that render to playable WAV files', () => {
    expect(BUILTIN_SOUNDS.map((s) => s.name)).toEqual(['Pop', 'Chime', 'Click', 'Boom', 'Beep']);
    for (const sound of BUILTIN_SOUNDS) {
      const bytes = renderBuiltinWav(sound);
      const header = readWavHeader(bytes);
      expect(header?.frames, sound.name).toBeGreaterThan(SAMPLE_RATE * 0.05);
      expect(header?.frames, sound.name).toBeLessThan(SAMPLE_RATE * 5);
    }
  });

  it('rendering is deterministic (same bytes every time)', () => {
    const chime = BUILTIN_SOUNDS.find((s) => s.name === 'Chime')!;
    expect(renderBuiltinWav(chime)).toEqual(renderBuiltinWav(chime));
  });
});

describe('user sound import validation', () => {
  it('accepts a valid WAV file', async () => {
    await expect(assertPlayableAudio(encodeWav(new Float32Array(100)), 'ok.wav')).resolves.toBeUndefined();
  });

  it('rejects empty files and WAV files with no samples', async () => {
    await expect(assertPlayableAudio(new Uint8Array(0), 'empty.wav')).rejects.toThrow(/empty/);
    await expect(assertPlayableAudio(encodeWav(new Float32Array(0)), 'none.wav')).rejects.toThrow(/no audio samples/);
  });

  it('rejects files over the size limit before decoding them', async () => {
    const big = new Uint8Array(MAX_SOUND_BYTES + 1);
    await expect(assertPlayableAudio(big, 'huge.mp3')).rejects.toThrow(/larger than/);
  });

  it('rejects non-audio bytes that the browser cannot decode (no OfflineAudioContext in Node)', async () => {
    await expect(assertPlayableAudio(new TextEncoder().encode('just text'), 'notes.mp3')).rejects.toThrow();
  });
});

describe('WebAudioHost without a browser', () => {
  it('reports unsupported when there is no AudioContext, and play throws a readable error', () => {
    const host = new WebAudioHost(async () => null, () => {
      throw new Error('no audio device');
    });
    expect(host.status()).toBe('unsupported');
    expect(() => host.play('missing', null, 100)).toThrow();
  });
});
