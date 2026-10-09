/**
 * AudioEngine against a fake AudioContext. The fake stands in for the browser's audio hardware only;
 * the engine's own logic (gesture gate, buffers, gain chain, stop semantics) runs for real.
 */
import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/audioEngine';

class FakeNode {
  readonly connections: unknown[] = [];
  connect(dest: unknown): void {
    this.connections.push(dest);
  }
}

class FakeGain extends FakeNode {
  gain = { value: 1 };
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  start(): void {
    this.started = true;
  }
  stop(): void {
    if (this.stopped) throw new Error('already stopped');
    this.stopped = true;
  }
}

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];
  readonly decoded: ArrayBuffer[] = [];
  decodeFails = false;
  resumeCalls = 0;
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
  async decodeAudioData(bytes: ArrayBuffer): Promise<unknown> {
    if (this.decodeFails) throw new Error('bad data');
    this.decoded.push(bytes);
    return { duration: 1, length: bytes.byteLength };
  }
  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.state = 'closed';
  }
}

function setup() {
  const ctx = new FakeContext();
  const engine = new AudioEngine(() => ctx as unknown as AudioContext);
  return { ctx, engine };
}

const BYTES = new Uint8Array([1, 2, 3, 4]).buffer;

describe('AudioEngine', () => {
  it('refuses to play before the user gesture unlocks audio', async () => {
    const { ctx, engine } = setup();
    await engine.load('boom', BYTES);
    expect(() => engine.play('boom')).toThrow(/blocked by the browser/);
    expect(ctx.sources).toHaveLength(0);
  });

  it('unlock resumes the context and reports success', async () => {
    const { ctx, engine } = setup();
    expect(await engine.unlock()).toBe(true);
    expect(ctx.resumeCalls).toBe(1);
    expect(engine.unlocked).toBe(true);
  });

  it('reports failure to unlock when the browser keeps the context suspended', async () => {
    const { ctx, engine } = setup();
    ctx.resume = async () => {
      ctx.resumeCalls++;
    };
    expect(await engine.unlock()).toBe(false);
    expect(engine.unlocked).toBe(false);
  });

  it('plays a loaded sound through a per-playback gain into the master gain', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    await engine.load('boom', BYTES);
    engine.setMasterVolume(0.5);
    const handle = engine.play('boom', 0.25);
    const [master, playbackGain] = ctx.gains;
    expect(master!.gain.value).toBe(0.5);
    expect(playbackGain!.gain.value).toBe(0.25);
    expect(master!.connections).toContain(ctx.destination);
    expect(ctx.sources[0]!.connections).toEqual([playbackGain]);
    expect(playbackGain!.connections).toEqual([master]);
    expect(ctx.sources[0]!.started).toBe(true);
    expect(handle.isPlaying()).toBe(true);
  });

  it('clamps per-playback volume into 0..1 and treats NaN as full volume', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    await engine.load('boom', BYTES);
    engine.play('boom', 4);
    engine.play('boom', Number.NaN);
    expect(ctx.gains[1]!.gain.value).toBe(1);
    expect(ctx.gains[2]!.gain.value).toBe(1);
  });

  it('clamps master volume and applies it to a live master gain', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    await engine.load('boom', BYTES);
    engine.play('boom');
    engine.setMasterVolume(7);
    expect(ctx.gains[0]!.gain.value).toBe(1);
    engine.setMasterVolume(-2);
    expect(ctx.gains[0]!.gain.value).toBe(0);
  });

  it('reports a sound that was never loaded', async () => {
    const { engine } = setup();
    await engine.unlock();
    expect(() => engine.play('missing')).toThrow(/still loading or could not be decoded/);
  });

  it('a failed decode leaves the sound unavailable and does not affect other sounds', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    ctx.decodeFails = true;
    await expect(engine.load('bad', BYTES)).rejects.toThrow('bad data');
    ctx.decodeFails = false;
    await engine.load('good', BYTES);
    expect(engine.hasBuffer('bad')).toBe(false);
    expect(engine.hasBuffer('good')).toBe(true);
    expect(() => engine.play('bad')).toThrow();
    expect(() => engine.play('good')).not.toThrow();
  });

  it('stop halts only the named sound; stopAll halts everything', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    await engine.load('a', BYTES);
    await engine.load('b', BYTES);
    const ha = engine.play('a');
    const hb = engine.play('b');
    engine.stop('a');
    expect(ctx.sources[0]!.stopped).toBe(true);
    expect(ctx.sources[1]!.stopped).toBe(false);
    expect(ha.isPlaying()).toBe(false);
    expect(hb.isPlaying()).toBe(true);
    engine.stopAll();
    expect(ctx.sources[1]!.stopped).toBe(true);
    expect(hb.isPlaying()).toBe(false);
  });

  it('a playback that finishes on its own is no longer playing', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    await engine.load('a', BYTES);
    const h = engine.play('a');
    ctx.sources[0]!.onended?.();
    expect(h.isPlaying()).toBe(false);
  });

  it('retain forgets decoded sounds that are no longer in the project', async () => {
    const { engine } = setup();
    await engine.load('keep', BYTES);
    await engine.load('drop', BYTES);
    engine.retain(['keep']);
    expect(engine.hasBuffer('keep')).toBe(true);
    expect(engine.hasBuffer('drop')).toBe(false);
  });

  it('close releases the context and forgets playbacks', async () => {
    const { ctx, engine } = setup();
    await engine.unlock();
    await engine.load('a', BYTES);
    engine.play('a');
    await engine.close();
    expect(ctx.state).toBe('closed');
    expect(engine.unlocked).toBe(false);
  });
});
