import { useAppStore, isDirty } from '../store';
import { exportProject, importProjectFile, revertProject, saveProject } from '../actions';
import { useRef } from 'react';
import { APP_VERSION } from '../../model/defaults';

export function TopBar({ onRun, onStop, onReset }: { onRun: () => void; onStop: () => void; onReset: () => void }) {
  const project = useAppStore((s) => s.project);
  const saved = useAppStore((s) => s.saved);
  const mode = useAppStore((s) => s.mode);
  const tab = useAppStore((s) => s.tab);
  const saveState = useAppStore((s) => s.saveState);
  const importRef = useRef<HTMLInputElement>(null);
  const dirty = isDirty(project, saved);
  const running = mode === 'running';
  const status = running ? 'Running' : mode === 'stopped' ? 'Stopped' : 'Editing';
  return (
    <header className="topbar" data-testid="topbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">◆</span> Bite <span className="version">{APP_VERSION}</span>
      </div>
      <button className="project-name" onClick={() => useAppStore.getState().setProjectsOpen(true)} data-testid="projects-button" title="Projects">
        {project?.name ?? 'Loading…'}
      </button>
      <span className={`save-state ${dirty ? 'dirty' : 'clean'}`} data-testid="save-state" role="status">
        {saveState === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes (autosaved)' : 'All changes saved'}
      </span>
      <div className="transport" role="group" aria-label="Play controls">
        <button className="run" onClick={onRun} disabled={!project || running} data-testid="run-button" title="Run (green flag)">
          ▶ Run
        </button>
        <button onClick={onStop} disabled={!running} data-testid="stop-button" title="Stop all scripts">
          ■ Stop
        </button>
        <button onClick={onReset} disabled={mode === 'edit'} data-testid="reset-button" title="Discard the play session and return to editing">
          ↺ Reset
        </button>
        <span className={`status status-${mode}`} data-testid="mode-status">{status}</span>
      </div>
      <div className="tabs" role="tablist" aria-label="Workspace">
        <button role="tab" aria-selected={tab === 'scene'} className={tab === 'scene' ? 'tab active' : 'tab'} onClick={() => useAppStore.getState().setTab('scene')} data-testid="tab-scene">
          Scene
        </button>
        <button role="tab" aria-selected={tab === 'code'} className={tab === 'code' ? 'tab active' : 'tab'} onClick={() => useAppStore.getState().setTab('code')} data-testid="tab-code">
          Code
        </button>
      </div>
      <div className="file-actions" role="group" aria-label="Project">
        <button onClick={() => void saveProject()} disabled={!project || !dirty} data-testid="save-button" title="Save the working copy as the saved version">
          Save
        </button>
        <button onClick={() => void revertProject()} disabled={!project || !dirty || !saved || running} data-testid="revert-button" title="Discard unsaved changes">
          Revert
        </button>
        <button onClick={() => void exportProject()} disabled={!project} data-testid="export-button">
          Export…
        </button>
        <button onClick={() => importRef.current?.click()} data-testid="import-button">
          Import…
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".bite,.zip,application/zip"
          hidden
          data-testid="import-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importProjectFile(f);
          }}
        />
      </div>
    </header>
  );
}
