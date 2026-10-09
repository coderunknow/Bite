/**
 * Deterministic stand-ins for the audio device. The runtime is tested with real scene state;
 * only the sound output device (an external boundary) is replaced. Browser e2e tests use the
 * real Web Audio engine.
 */
import type { AudioHost, SoundHandle } from '../../src/runtime/types';
import type { SoundSource } from '../../src/audio/webAudioHost';

export interface PlayedSound {
  soundId: string;
  targetId: string | null;
  volume: number;
  handle: FakeHandle;
}

export class FakeHandle implements SoundHandle {
  done = false;
  volume: number;
  stopped = false;
  constructor(volume: number) {
    this.volume = volume;
  }
  stop(): void {
    this.stopped = true;
    this.done = true;
  }
  setVolume(percent: number): void {
    this.volume = percent;
  }
  finish(): void {
    this.done = true;
  }
}

export class FakeAudio implements AudioHost {
  readonly played: PlayedSound[] = [];
  readonly sounds = new Set<string>();
  stopAllCalls = 0;
  readonly stoppedSounds: string[] = [];

  /** Mirrors WebAudioHost.load: every sound becomes playable. No decode errors are simulated. */
  async load(sounds: SoundSource[]): Promise<Map<string, string>> {
    for (const sound of sounds) this.sounds.add(sound.id);
    return new Map();
  }

  hasSound(soundId: string): boolean {
    return this.sounds.has(soundId);
  }
  play(soundId: string, targetId: string | null, volumePercent: number): SoundHandle {
    if (!this.sounds.has(soundId)) throw new Error(`unknown sound ${soundId}`);
    const handle = new FakeHandle(volumePercent);
    this.played.push({ soundId, targetId, volume: volumePercent, handle });
    return handle;
  }
  stopSound(soundId: string): void {
    this.stoppedSounds.push(soundId);
    for (const p of this.played) if (p.soundId === soundId) p.handle.stop();
  }
  stopAll(): void {
    this.stopAllCalls += 1;
    for (const p of this.played) p.handle.stop();
  }
  setTargetVolume(targetId: string, percent: number): void {
    for (const p of this.played) if (p.targetId === targetId) p.handle.setVolume(percent);
  }
}
