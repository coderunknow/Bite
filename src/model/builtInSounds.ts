import type { SoundAsset } from './types';

/**
 * Describes a built-in sound. The asset bytes are generated locally by audio/synthesis.ts, so built-in
 * sounds need no network access and are stored in projects like any other asset.
 */
export interface BuiltInSoundDescriptor {
  asset: SoundAsset;
  recipe: 'pop' | 'beep' | 'chime' | 'boing' | 'click';
}

export const BUILT_IN_SOUNDS: readonly BuiltInSoundDescriptor[] = [
  { recipe: 'pop', asset: { id: 'builtin-pop', name: 'Pop', extension: 'wav', mimeType: 'audio/wav', byteLength: 0, durationSec: null, builtIn: true } },
  { recipe: 'beep', asset: { id: 'builtin-beep', name: 'Beep', extension: 'wav', mimeType: 'audio/wav', byteLength: 0, durationSec: null, builtIn: true } },
  { recipe: 'chime', asset: { id: 'builtin-chime', name: 'Chime', extension: 'wav', mimeType: 'audio/wav', byteLength: 0, durationSec: null, builtIn: true } },
  { recipe: 'boing', asset: { id: 'builtin-boing', name: 'Boing', extension: 'wav', mimeType: 'audio/wav', byteLength: 0, durationSec: null, builtIn: true } },
  { recipe: 'click', asset: { id: 'builtin-click', name: 'Click', extension: 'wav', mimeType: 'audio/wav', byteLength: 0, durationSec: null, builtIn: true } },
];
