/**
 * WebAudio playback behind the runtime's AudioPort. Sounds are decoded from project bytes before play
 * starts. The AudioContext is created and resumed only from a user gesture (the Run button or a key press),
 * because browsers block audio otherwise. No network access is involved.
 */
import type { AudioPort, PlaybackHandle } from '../runtime/types';

interface Playback {
  source: AudioBufferSourceNode;
  gain: GainNode;
  done: boolean;
}

export class AudioEngine implements AudioPort {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly playbacks = new Map<string, Set<Playback>>();
  private masterVolume = 1;

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  /** Must be called from a user gesture. Creates the context on first use and resumes it. */
  async unlock(): Promise<boolean> {
    const ctx = this.ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    return ctx.state === 'running';
  }

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Decodes a sound and keeps the buffer for playback. Safe to call before unlock(). */
  async load(soundId: string, bytes: ArrayBuffer): Promise<void> {
    const ctx = this.ensureContext();
    const buffer = await ctx.decodeAudioData(bytes);
    this.buffers.set(soundId, buffer);
  }

  hasBuffer(soundId: string): boolean {
    return this.buffers.has(soundId);
  }

  /** Forgets decoded sounds that are no longer in the project. */
  retain(soundIds: Iterable<string>): void {
    const keep = new Set(soundIds);
    for (const id of [...this.buffers.keys()]) if (!keep.has(id)) this.buffers.delete(id);
  }

  /** Starts a sound. `volume` is per playback, 0..1; the master volume applies on top of it. */
  play(soundId: string, volume = 1): PlaybackHandle {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') {
      throw new Error('Sound is blocked by the browser until you interact with the page. Press Run again.');
    }
    const buffer = this.buffers.get(soundId);
    if (!buffer) throw new Error('This sound is still loading or could not be decoded');
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
    source.connect(gain);
    gain.connect(this.master);
    const playback: Playback = { source, gain, done: false };
    let set = this.playbacks.get(soundId);
    if (!set) this.playbacks.set(soundId, (set = new Set()));
    set.add(playback);
    source.onended = () => {
      playback.done = true;
      set?.delete(playback);
    };
    source.start();
    return { isPlaying: () => !playback.done };
  }

  stop(soundId: string): void {
    const set = this.playbacks.get(soundId);
    if (!set) return;
    for (const p of set) this.halt(p);
    set.clear();
  }

  stopAll(): void {
    for (const set of this.playbacks.values()) {
      for (const p of set) this.halt(p);
      set.clear();
    }
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
    if (this.master) this.master.gain.value = this.masterVolume;
  }

  async close(): Promise<void> {
    this.stopAll();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    if (ctx && ctx.state !== 'closed') await ctx.close();
  }

  private halt(p: Playback): void {
    if (p.done) return;
    p.done = true;
    try {
      p.source.stop();
    } catch {
      // Already stopped.
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.createContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterVolume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }
}
