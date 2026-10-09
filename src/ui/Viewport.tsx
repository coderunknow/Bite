import { useEffect, useRef } from 'react';
import type { Studio } from '../app/studio';
import { StageView, type TransformMode, type ViewMode } from '../stage/stageView';
import { useStudio } from './useStudio';

/** The 3D stage. Editor camera (orbit + gizmos) and scene camera (what the program's camera sees). */
export function Viewport({ studio }: { studio: Studio }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<StageView | null>(null);
  const project = useStudio(studio, (s) => s.project);
  const runState = useStudio(studio, (s) => s.runState);
  const viewMode = useStudio(studio, (s) => s.viewMode);
  const transformMode = useStudio(studio, (s) => s.transformMode);
  const selectedId = useStudio(studio, (s) => s.selectedId);
  const audioStatus = useStudio(studio, (s) => s.audioStatus);
  const running = runState === 'running';

  // Create the stage once; sync it from the studio's frame loop while the program runs.
  useEffect(() => {
    const stage = new StageView(hostRef.current!, {
      onSelect: (id) => studio.selectObject(id),
      onTransform: (id, patch) => studio.setTransform(id, patch),
    });
    stageRef.current = stage;
    const off = studio.onFrame(() => {
      const state = studio.store.getState();
      if (state.runState === 'running' && state.project) stage.sync(state.project, studio.engine.scene);
    });
    return () => {
      off();
      stage.dispose();
      stageRef.current = null;
    };
  }, [studio]);

  useEffect(() => {
    stageRef.current?.setViewMode(viewMode as ViewMode);
  }, [viewMode]);

  useEffect(() => {
    stageRef.current?.setTransformMode(transformMode as TransformMode);
  }, [transformMode]);

  useEffect(() => {
    stageRef.current?.setGridVisible(project?.settings.gridVisible ?? true);
  }, [project?.settings.gridVisible]);

  const background = project?.settings.background;
  useEffect(() => {
    if (background) stageRef.current?.setBackground(background);
  }, [background]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setEditable(!running);
    stage.setContinuous(running);
  }, [running]);

  // Stopped, idle or edited: show the live scene (authored layout after Reset, last pose after Stop).
  useEffect(() => {
    if (project && !running) stageRef.current?.sync(project, studio.engine.scene);
  }, [project, running, studio]);

  useEffect(() => {
    stageRef.current?.setSelected(selectedId);
  }, [selectedId]);

  return (
    <div className="viewport">
      <div className="viewport-bar">
        <div className="segmented" role="group" aria-label="Camera">
          <button type="button" className={viewMode === 'edit' ? 'on' : ''} onClick={() => studio.setViewMode('edit')} data-testid="view-editor">
            Editor camera
          </button>
          <button type="button" className={viewMode === 'stage' ? 'on' : ''} onClick={() => studio.setViewMode('stage')} data-testid="view-stage">
            Scene camera
          </button>
        </div>
        <div className="segmented" role="group" aria-label="Transform">
          {(['translate', 'rotate', 'scale'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={transformMode === mode ? 'on' : ''}
              disabled={running}
              onClick={() => studio.setTransformMode(mode)}
              data-testid={`gizmo-${mode}`}
            >
              {mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={project?.settings.gridVisible ? 'on' : ''}
          onClick={() => studio.setSettings({ gridVisible: !(project?.settings.gridVisible ?? true) })}
          disabled={running}
        >
          Grid
        </button>
        <span className={`run-badge ${running ? 'live' : ''}`} data-testid="run-badge">
          {running ? 'Running' : runState === 'stopped' ? 'Stopped (live state kept)' : 'Edit'}
        </span>
      </div>
      <div className="stage-host" ref={hostRef} />
      {audioStatus !== 'running' && audioStatus !== 'unsupported' && (
        <button type="button" className="sound-banner" onClick={() => void studio.enableAudio()}>
          Sound is off. Click here to enable it.
        </button>
      )}
    </div>
  );
}
