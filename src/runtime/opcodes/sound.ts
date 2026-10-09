import type { BlockNode } from '../../model/types';
import { BlockError, type OpContext } from '../context';
import type { PlaybackHandle } from '../types';
import type { ReporterImpl, StatementImpl } from './types';

function soundId(ctx: OpContext, node: BlockNode): string {
  const id = ctx.field(node, 'SOUND');
  if (!ctx.runtime.hasSound(id)) throw new BlockError(node.id, 'That sound does not exist (it may have been deleted)');
  return id;
}

function startSound(ctx: OpContext, node: BlockNode): PlaybackHandle {
  const id = soundId(ctx, node);
  try {
    return ctx.runtime.audio.play(id, 1);
  } catch (err) {
    throw new BlockError(node.id, err instanceof Error ? err.message : 'The sound could not be played');
  }
}

function* playUntilDone(ctx: OpContext, node: BlockNode): Generator<void, void, void> {
  const handle = startSound(ctx, node);
  while (handle.isPlaying()) yield;
}

export const soundStatements: Record<string, StatementImpl> = {
  sound_play(ctx, node) {
    startSound(ctx, node);
  },
  sound_playUntilDone(ctx, node) {
    return playUntilDone(ctx, node);
  },
  sound_stop(ctx, node) {
    ctx.runtime.audio.stop(soundId(ctx, node));
  },
  sound_stopAll(ctx) {
    ctx.runtime.audio.stopAll();
  },
  sound_setVolume(ctx, node) {
    ctx.runtime.setMasterVolume(ctx.num(node, 'PERCENT'));
  },
  sound_changeVolume(ctx, node) {
    ctx.runtime.setMasterVolume(ctx.runtime.state.masterVolume + ctx.num(node, 'PERCENT'));
  },
};

export const soundReporters: Record<string, ReporterImpl> = {
  sound_volume(ctx) {
    return ctx.runtime.state.masterVolume;
  },
};
