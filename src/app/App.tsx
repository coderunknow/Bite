import { useEffect, useRef, useState } from 'react';
import { useAppStore } from './store';
import { openLibrary } from './persistence';
import { Studio } from './studio';
import { bindServices, createProject, openProject, refreshProjects, saveProject } from './actions';
import { TopBar } from './components/TopBar';
import { Hierarchy } from './components/Hierarchy';
import { Inspector } from './components/Inspector';
import { BottomPanel } from './components/BottomPanel';
import { Banners, ConfirmDialog, Toasts } from './components/Overlays';
import { ProjectsDialog } from './components/ProjectsDialog';

export function App() {
  const tab = useAppStore((s) => s.tab);
  const project = useAppStore((s) => s.project);
  const viewportRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Bootstrap: open storage, then the last project (or create one). Runs once, even under StrictMode.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      try {
        const lib = await openLibrary();
        const s = new Studio(lib.service);
        bindServices({ service: lib.service, studio: s });
        useAppStore.getState().setBackend(lib.backend, lib.warning);
        await refreshProjects();
        const last = await lib.service.getSetting('lastProjectId');
        const list = useAppStore.getState().projects;
        const target = list.find((p) => p.id === last) ?? list[0];
        if (target) await openProject(target.id, { recovered: true });
        else await createProject('My first project');
        setStudio(s);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  // Mount the 3D view and the code editor once the project is available.
  useEffect(() => {
    if (!studio || !project || !viewportRef.current || !codeRef.current) return;
    studio.mount(viewportRef.current, codeRef.current);
    return () => studio.unmount();
    // The studio is mounted once per session; project changes flow through the store subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio]);

  // Global shortcuts and page lifecycle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveProject();
      }
      if (e.key === 'Escape') {
        const st = useAppStore.getState();
        if (st.confirm) st.setConfirm(null);
        else if (st.projectsOpen) st.setProjectsOpen(false);
      }
    };
    const onHide = () => {
      if (studio) void studio.flushAutosave();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
    };
  }, [studio]);

  // Test and support hook: a read-only snapshot of the studio. Not used by the product UI.
  useEffect(() => {
    if (!studio) return;
    (window as unknown as { __BITE__?: unknown }).__BITE__ = {
      snapshot: () => studio.debugSnapshot(),
      screenshot: () => studio.screenshot(),
      version: '0.1.0-beta1',
    };
  }, [studio]);

  if (loadError) {
    return (
      <div className="fatal" role="alert" data-testid="fatal-error">
        <h1>Bite could not start</h1>
        <p>{loadError}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar onRun={() => void studio?.run()} onStop={() => studio?.stop()} onReset={() => studio?.reset()} />
      <Banners />
      <div className="main">
        <Hierarchy />
        <div className="center">
          <div className="pane" hidden={tab !== 'scene'}>
            <div ref={viewportRef} className="viewport" data-testid="viewport" />
          </div>
          <div className="pane" hidden={tab !== 'code'}>
            <div ref={codeRef} className="code" data-testid="code-editor" />
          </div>
          {!studio && <div className="loading">Loading project…</div>}
        </div>
        <Inspector />
      </div>
      <BottomPanel />
      <ProjectsDialog />
      <ConfirmDialog />
      <Toasts />
    </div>
  );
}
