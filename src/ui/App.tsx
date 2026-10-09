import { useEffect } from 'react';
import type { Studio } from '../app/studio';
import { Toolbar } from './Toolbar';
import { Hierarchy } from './Hierarchy';
import { ScriptEditor } from './ScriptEditor';
import { Viewport } from './Viewport';
import { Inspector } from './Inspector';
import { SoundsPanel, VariablesPanel } from './SidePanels';
import { Diagnostics } from './Diagnostics';
import { Dialogs } from './Dialogs';
import { PanelBoundary } from './common';
import { useStudio } from './useStudio';
import type { RightTab } from '../app/studio';

const TABS: Array<[RightTab, string]> = [
  ['inspector', 'Properties'],
  ['sounds', 'Sounds'],
  ['variables', 'Variables'],
];

export function App({ studio }: { studio: Studio }) {
  const ready = useStudio(studio, (s) => s.ready);
  const startupError = useStudio(studio, (s) => s.startupError);
  const notices = useStudio(studio, (s) => s.notices);
  const rightTab = useStudio(studio, (s) => s.rightTab);
  const hasProject = useStudio(studio, (s) => s.project !== null);

  // One frame loop drives the program (fixed steps) and the views.
  useEffect(() => {
    let last = performance.now();
    let handle = 0;
    const frame = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      studio.tick(dt);
      handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [studio]);

  // Ctrl/Cmd+S saves. Delete removes the selected object unless the user is typing or editing blocks.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void studio.saveNow();
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      if (!target || target.closest('input, textarea, select, [contenteditable="true"], .injectionDiv, .blocklyWidgetDiv, .modal')) return;
      if (studio.store.getState().selectedId) {
        event.preventDefault();
        if (window.confirm('Delete the selected object? This cannot be undone.')) studio.deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio]);

  if (!ready) {
    return (
      <div className="splash">
        <div className="logo big">B</div>
        <p>Opening your projects…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Toolbar studio={studio} />
      {startupError && (
        <div className="banner error" role="alert" data-testid="startup-error">
          {startupError}
        </div>
      )}
      <main className="workspace">
        <aside className="col left"><PanelBoundary name="hierarchy">{hasProject && <Hierarchy studio={studio} />}</PanelBoundary></aside>
        <section className="col center">
          <PanelBoundary name="script"><ScriptEditor studio={studio} /></PanelBoundary>
        </section>
        <section className="col right">
          <PanelBoundary name="stage"><Viewport studio={studio} /></PanelBoundary>
          <nav className="tabs" role="tablist">
            {TABS.map(([tab, label]) => (
              <button key={tab} type="button" role="tab" aria-selected={rightTab === tab} className={rightTab === tab ? 'on' : ''} onClick={() => studio.setRightTab(tab)} data-testid={`tab-${tab}`}>
                {label}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            <PanelBoundary name={rightTab}>
              {rightTab === 'inspector' && <Inspector studio={studio} />}
              {rightTab === 'sounds' && <SoundsPanel studio={studio} />}
              {rightTab === 'variables' && <VariablesPanel studio={studio} />}
            </PanelBoundary>
          </div>
        </section>
      </main>
      <Diagnostics studio={studio} />
      <div className="notices" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={`notice ${n.kind}`} role={n.kind === 'error' ? 'alert' : 'status'}>
            <span>{n.text}</span>
            <button type="button" className="ghost" aria-label="Dismiss" onClick={() => studio.dismissNotice(n.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
      <Dialogs studio={studio} />
    </div>
  );
}
