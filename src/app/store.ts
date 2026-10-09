/**
 * Application state. `project` is the working copy the user edits; `saved` is the last explicit save.
 * Autosave writes the working copy; "dirty" means the two differ. Play mode never changes `project`.
 */
import { create } from 'zustand';
import type { LogEntry } from '../runtime/types';
import type { Project } from '../model/types';
import type { ProjectSummary } from '../storage/types';
import { EditError } from '../editor/edit';

export type Mode = 'edit' | 'running' | 'stopped';
export type Tab = 'scene' | 'code';
export type BottomTab = 'console' | 'sounds';
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'idle';

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

export interface Confirm {
  title: string;
  body: string;
  confirmLabel: string;
  /** When set, the user must type this text to confirm (used for deleting projects). */
  typeToConfirm?: string;
  danger?: boolean;
  onConfirm: () => void;
}

interface AppState {
  project: Project | null;
  saved: Project | null;
  projectId: string | null;
  backend: 'indexeddb' | 'memory' | null;
  backendWarning: string | null;
  /** Bumped when the editor must reload from the project (open, revert, import, duplicate). */
  epoch: number;
  selection: string | null;
  mode: Mode;
  tab: Tab;
  bottomTab: BottomTab;
  diagnostics: LogEntry[];
  toasts: Toast[];
  projects: ProjectSummary[];
  projectsOpen: boolean;
  recoveredChanges: boolean;
  saveState: SaveState;
  confirm: Confirm | null;
  audioBlocked: boolean;
  nextToastId: number;
}

interface AppActions {
  loadProject(id: string, project: Project, saved: Project | null, recovered: boolean): void;
  setProjects(list: ProjectSummary[]): void;
  setBackend(kind: 'indexeddb' | 'memory', warning: string | null): void;
  /** Applies an edit to the working copy. Invalid edits show a message instead of throwing. */
  edit(fn: (p: Project) => Project): boolean;
  setSaved(project: Project): void;
  setSaveState(state: SaveState): void;
  select(id: string | null): void;
  setMode(mode: Mode): void;
  setTab(tab: Tab): void;
  setBottomTab(tab: BottomTab): void;
  setDiagnostics(entries: LogEntry[]): void;
  toast(text: string, kind?: 'info' | 'error'): void;
  dismissToast(id: number): void;
  setProjectsOpen(open: boolean): void;
  dismissRecovery(): void;
  setConfirm(c: Confirm | null): void;
  setAudioBlocked(b: boolean): void;
  bumpEpoch(): void;
}

export const useAppStore = create<AppState & AppActions>()((set, get) => ({
  project: null,
  saved: null,
  projectId: null,
  backend: null,
  backendWarning: null,
  epoch: 0,
  selection: null,
  mode: 'edit',
  tab: 'scene',
  bottomTab: 'console',
  diagnostics: [],
  toasts: [],
  projects: [],
  projectsOpen: false,
  recoveredChanges: false,
  saveState: 'idle',
  confirm: null,
  audioBlocked: false,
  nextToastId: 1,

  loadProject(id, project, saved, recovered) {
    set({
      projectId: id,
      project,
      saved,
      recoveredChanges: recovered,
      epoch: get().epoch + 1,
      selection: null,
      diagnostics: [],
      mode: 'edit',
      saveState: 'saved',
    });
  },

  setProjects(list) {
    set({ projects: list });
  },

  setBackend(kind, warning) {
    set({ backend: kind, backendWarning: warning });
  },

  edit(fn) {
    const current = get().project;
    if (!current) return false;
    if (get().mode === 'running') {
      get().toast('Stop the project before editing.', 'error');
      return false;
    }
    try {
      const next = fn(current);
      set({ project: next, saveState: 'unsaved' });
      return true;
    } catch (err) {
      if (err instanceof EditError) get().toast(err.message, 'error');
      else get().toast(err instanceof Error ? err.message : 'That change could not be applied.', 'error');
      return false;
    }
  },

  setSaved(project) {
    set({ saved: structuredClone(project), saveState: 'saved' });
  },

  setSaveState(state) {
    set({ saveState: state });
  },

  select(id) {
    set({ selection: id });
  },

  setMode(mode) {
    set({ mode });
  },

  setTab(tab) {
    set({ tab });
  },

  setBottomTab(tab) {
    set({ bottomTab: tab });
  },

  setDiagnostics(entries) {
    set({ diagnostics: entries });
  },

  toast(text, kind = 'info') {
    const id = get().nextToastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }], nextToastId: id + 1 }));
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  setProjectsOpen(open) {
    set({ projectsOpen: open });
  },

  dismissRecovery() {
    set({ recoveredChanges: false });
  },

  setConfirm(c) {
    set({ confirm: c });
  },

  setAudioBlocked(b) {
    set({ audioBlocked: b });
  },

  bumpEpoch() {
    set({ epoch: get().epoch + 1 });
  },
}));

/** Whether the working copy differs from the last explicit save. */
export function isDirty(project: Project | null, saved: Project | null): boolean {
  if (!project) return false;
  if (!saved) return true;
  return JSON.stringify(project) !== JSON.stringify(saved);
}
