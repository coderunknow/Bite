import { UserError } from '../core/errors';
import { readWavHeader } from './wav';

export const MAX_SOUND_BYTES = 25 * 1024 * 1024;

/**
 * Checks that an imported file can be played before it is stored. WAV files are checked from the
 * header; other formats are decoded by the browser (no network access is involved).
 */
export async function assertPlayableAudio(bytes: Uint8Array, fileName: string): Promise<void> {
  if (bytes.byteLength === 0) throw new UserError(`"${fileName}" is empty.`);
  if (bytes.byteLength > MAX_SOUND_BYTES) {
    throw new UserError(`"${fileName}" is larger than ${MAX_SOUND_BYTES / (1024 * 1024)} MB. Use a shorter or smaller file.`);
  }
  const wav = readWavHeader(bytes);
  if (wav) {
    if (wav.frames <= 0) throw new UserError(`"${fileName}" contains no audio samples.`);
    return;
  }
  if (typeof OfflineAudioContext === 'undefined') {
    throw new UserError(`"${fileName}" is not a WAV file, and this browser cannot decode other audio formats.`);
  }
  try {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    await ctx.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
  } catch {
    throw new UserError(`"${fileName}" is not a supported audio file. Use WAV, MP3, OGG or M4A.`);
  }
}
