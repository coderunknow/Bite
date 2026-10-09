/**
 * Web Audio playback for the runtime (`AudioHost`). Sounds are decoded from bundled asset bytes.
 *
 * Browser autoplay rules: an AudioContext starts suspended until a user gesture resumes it. The app
 * exposes an "Enable audio" button that calls `unlock()`; while audio is not running, sound blocks
 * fail with a readable message instead of playing silently.
 */
import type { AudioHost, SoundHandle } from '../runtime/types';

export type AudioStatus = 'unsupported' | 'suspended' | 'running' | 'closed';

export interface SoundSource {
  id: string;
  name: string;
  assetId: string;
}

interface ActivePlayback {
  soundId: string;
  targetId: string | null;
  source: AudioBufferSourceNode;
  gain: GainNode;
  handle: PlaybackHandle;
}

class PlaybackHandle implements SoundHandle {
  done = false;
  constructor(private readonly onDone: () => void) {}
  /** Set by the host so stop/volume can reach the audio graph. */
  stopImpl: () => void = () => undefined;
  volumeImpl: (percent: number) => void = () => undefined;
  stop(): void {
    if (this.done) return;
    this.stopImpl();
    this.finish();
  }
  setVolume(percent: number): void {
    if (this.done) return;
    this.volumeImpl(percent);
  }
  finish(): void {
    if (this.done) return;
    this.done = true;
    this.onDone();
  }
}

export class WebAudioHost implements AudioHost {
  private context: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly sources = new Map<string, SoundSource>();
  private readonly active = new Set<ActivePlayback>();
  private readonly errors = new Map<string, string>();

  constructor(
    private readonly loadBytes: (assetId: string) => Promise<ArrayBuffer | null>,
    private readonly contextFactory: () => AudioContext = () => new AudioContext(),
  ) {}

  /** Current status for the UI. Creates the context lazily; creation can fail in old browsers. */
  status(): AudioStatus {
    if (this.context === null) {
      if (typeof AudioContext === 'undefined') return 'unsupported';
      return 'suspended';
    }
    if (this.context.state === 'closed') return 'closed';
    return this.context.state === 'running' ? 'running' : 'suspended';
  }

  /** Must be called from a user gesture (click handler). Resumes or creates the audio context. */
  async unlock(): Promise<AudioStatus> {
    if (this.context === null) {
      this.context = this.contextFactory();
    }
    if (this.context.state !== 'running') {
      await this.context.resume();
    }
    return this.status();
  }

  /**
   * Makes the given project sounds playable: fetches and decodes each asset. Returns a readable
   * error per sound that failed (missing bytes, unsupported format). Failed sounds stay unplayable.
   */
  async load(sounds: SoundSource[]): Promise<Map<string, string>> {
    this.sources.clear();
    this.buffers.clear();
    this.errors.clear();
    for (const sound of sounds) this.sources.set(sound.id, sound);
    await Promise.all(
      sounds.map(async (sound) => {
        try {
          const bytes = await this.loadBytes(sound.assetId);
          if (!bytes) throw new Error('the sound file is missing from the project');
          const ctx = this.decodeContext();
          const buffer = await ctx.decodeAudioData(bytes.slice(0));
          this.buffers.set(sound.id, buffer);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.errors.set(sound.id, `"${sound.name}" could not be loaded: ${reason}`);
        }
      }),
    );
    return new Map(this.errors);
  }

  /** Decoding works without a gesture on an OfflineAudioContext; used before the first unlock. */
  private decodeContext(): BaseAudioContext {
    if (this.context) return this.context;
    return new OfflineAudioContext(1, 1, 44100);
  }

  hasSound(soundId: string): boolean {
    return this.buffers.has(soundId);
  }

  loadError(soundId: string): string | undefined {
    return this.errors.get(soundId);
  }

  play(soundId: string, targetId: string | null, volumePercent: number): SoundHandle {
    const buffer = this.buffers.get(soundId);
    if (!buffer) {
      throw new Error(this.errors.get(soundId) ?? 'the sound is not loaded');
    }
    if (!this.context || this.context.state !== 'running') {
      throw new Error('audio is turned off in this browser. Click "Enable audio" in the toolbar, then run again.');
    }
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = clampUnit(volumePercent / 100);
    source.connect(gain).connect(ctx.destination);
    const handle = new PlaybackHandle(() => {
      this.active.delete(record);
    });
    const record: ActivePlayback = { soundId, targetId, source, gain, handle };
    handle.stopImpl = () => {
      try {
        source.stop();
      } catch {
        // stop() throws if the source already ended; that is the state we want.
      }
      source.disconnect();
      gain.disconnect();
    };
    handle.volumeImpl = (percent: number) => {
      gain.gain.value = clampUnit(percent / 100);
    };
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      handle.finish();
    };
    this.active.add(record);
    source.start();
    return handle;
  }

  stopSound(soundId: string): void {
    for (const record of [...this.active]) {
      if (record.soundId === soundId) record.handle.stop();
    }
  }

  stopAll(): void {
    for (const record of [...this.active]) record.handle.stop();
  }

  setTargetVolume(targetId: string, percent: number): void {
    for (const record of this.active) {
      if (record.targetId === targetId) record.handle.setVolume(percent);
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  async close(): Promise<void> {
    this.stopAll();
    const ctx = this.context;
    this.context = null;
    if (ctx && ctx.state !== 'closed') await ctx.close();
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}
