import { useStore } from 'zustand';
import type { Studio, StudioState } from '../app/studio';

/** Subscribes a component to one slice of the studio state. */
export function useStudio<T>(studio: Studio, selector: (state: StudioState) => T): T {
  return useStore(studio.store, selector);
}
