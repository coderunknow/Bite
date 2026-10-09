import { useState } from 'react';
import type { Studio } from '../app/studio';
import { useStudio } from './useStudio';
import { APP_VERSION } from '../core/project';

const SAVE_LABEL = {
  idle: '',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'All changes saved',
  error: 'Save failed',
} as const;

export function Toolbar({ studio }: { studio: Studio }) {
  const projectName = useStudio(studio, (s) => s.project?.name ?? '');
  const saveStatus = useStudio(studio, (s) => s.saveStatus);
  const runState = useStudio(studio, (s) => s.runState);
  const audioStatus = useStudio(studio, (s) => s.audioStatus);
  const hasProject = useStudio(studio, (s) => s.project !== null);
  const running = runState === 'running';

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">B</span>
        <strong>Bite</strong>
        <span className="version">v{APP_VERSION}</span>
      </div>
      <button
        type="button"
        className="project-button"
        title="Open or manage projects"
        onClick={() => studio.openDialog({ type: 'open-project' })}
        data-testid="project-name"
      >
        {projectName || 'No project'} ▾
      </button>
      <span className={`save-status ${saveStatus}`} role="status" data-testid="save-status">
        {SAVE_LABEL[saveStatus]}
      </span>
      <ProjectMenu studio={studio} disabled={!hasProject} />
      <div className="run-controls" role="group" aria-label="Program">
        <button type="button" className="run" onClick={() => void studio.run()} disabled={running || !hasProject} data-testid="run">
          ▶ Run
        </button>
        <button type="button" onClick={() => studio.stop()} disabled={!running} data-testid="stop">
          ■ Stop
        </button>
        <button type="button" onClick={() => studio.reset()} disabled={running || !hasProject} data-testid="reset" title="Restore the authored layout">
          ↺ Reset
        </button>
      </div>
      <AudioButton studio={studio} status={audioStatus} />
    </header>
  );
}

function AudioButton({ studio, status }: { studio: Studio; status: string }) {
  if (status === 'running') {
    return (
      <span className="audio-on" data-testid="audio-status" title="Sound is enabled">
        🔊 Sound on
      </span>
    );
  }
  if (status === 'unsupported') {
    return (
      <span className="audio-off" data-testid="audio-status" title="This browser has no Web Audio support">
        🔇 No audio support
      </span>
    );
  }
  return (
    <button type="button" className="audio-enable" onClick={() => void studio.enableAudio()} data-testid="enable-audio" title="Browsers need a click before a page can play sound">
      🔈 Enable sound
    </button>
  );
}

function ProjectMenu({ studio, disabled }: { studio: Studio; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const project = useStudio(studio, (s) => s.project);
  return (
    <div className="menu" onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="project-menu">
        Project ▾
      </button>
      {open && (
        <div className="menu-body" role="menu">
          <button type="button" role="menuitem" onClick={pick(() => studio.openDialog({ type: 'new-project' }))}>New project…</button>
          <button type="button" role="menuitem" onClick={pick(() => studio.openDialog({ type: 'open-project' }))}>Open / manage projects…</button>
          <hr />
          <button type="button" role="menuitem" disabled={disabled} onClick={pick(() => project && studio.openDialog({ type: 'rename-project', projectId: project.id }))}>Rename…</button>
          <button type="button" role="menuitem" disabled={disabled} onClick={pick(() => project && studio.openDialog({ type: 'duplicate-project', projectId: project.id }))}>Duplicate…</button>
          <button type="button" role="menuitem" disabled={disabled} onClick={pick(() => project && studio.openDialog({ type: 'delete-project', projectId: project.id }))}>Delete…</button>
          <hr />
          <button type="button" role="menuitem" disabled={disabled} onClick={pick(() => void studio.saveNow())}>Save now (Ctrl+S)</button>
          <button type="button" role="menuitem" onClick={pick(() => studio.openDialog({ type: 'import' }))}>Import file…</button>
          <button type="button" role="menuitem" disabled={disabled} onClick={pick(() => void studio.exportProject())}>Export .bite package…</button>
        </div>
      )}
    </div>
  );
}
