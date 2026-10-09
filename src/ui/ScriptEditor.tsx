import { useEffect, useRef, useState } from 'react';
import type { Studio } from '../app/studio';
import { BlockEditor } from '../editor/blocklyBridge';
import { STAGE_TARGET_ID, type ScriptsJSON } from '../core/types';
import type { Project } from '../core/project';
import { optionsFor } from './options';
import { useStudio } from './useStudio';

function scriptsOf(project: Project, target: string): ScriptsJSON | undefined {
  if (target === STAGE_TARGET_ID) return project.stage.scripts;
  return project.objects.find((o) => o.id === target)?.scripts;
}

/** Block editor for the Stage or the selected object. Edits save to the project after each change. */
export function ScriptEditor({ studio }: { studio: Studio }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<BlockEditor | null>(null);
  const project = useStudio(studio, (s) => s.project);
  const target = useStudio(studio, (s) => s.scriptTarget);
  const diagnosticsVersion = useStudio(studio, (s) => s.diagnosticsVersion);
  const focusBlockId = useStudio(studio, (s) => s.focusBlockId);
  const runState = useStudio(studio, (s) => s.runState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const projectRef = useRef(project);
  const targetRef = useRef(target);
  projectRef.current = project;
  targetRef.current = target;

  // Create the editor once. Each user edit saves that target's scripts.
  useEffect(() => {
    const editor = new BlockEditor({
      container: hostRef.current!,
      onChange: () => studio.setScripts(targetRef.current, editor.save()),
      onNewVariable: () => studio.openDialog({ type: 'new-variable' }),
      onNewMessage: () => studio.openDialog({ type: 'new-message' }),
      options: (source) => optionsFor(projectRef.current, targetRef.current, source),
    });
    editorRef.current = editor;
    const observer = new ResizeObserver(() => editor.resize());
    observer.observe(hostRef.current!);
    return () => {
      observer.disconnect();
      editor.dispose();
      editorRef.current = null;
    };
  }, [studio]);

  // Load the scripts of the selected target (and reload when a different project is opened).
  useEffect(() => {
    const editor = editorRef.current;
    const current = projectRef.current;
    if (!editor || !current) return;
    const error = editor.load(scriptsOf(current, target));
    setLoadError(error);
    if (error) studio.notify('error', `Could not open the scripts of ${target === STAGE_TARGET_ID ? 'the Stage' : 'this object'}: ${error}`);
    editor.refreshOptions();
  }, [target, project?.id, studio]);

  // Keep dropdowns in step with variables, messages, sounds and object names.
  useEffect(() => {
    editorRef.current?.refreshOptions();
  }, [project]);

  // Show the latest runtime diagnostics on the blocks of this target.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const messages = new Map<string, string>();
    for (const entry of studio.engine.logs) {
      if (entry.blockId && entry.targetId === target && entry.level !== 'info') messages.set(entry.blockId, entry.message);
    }
    editor.showBlockMessages(messages);
    // diagnosticsVersion is the change signal for logs; the logs themselves are read from the engine.
  }, [diagnosticsVersion, target, studio]);

  useEffect(() => {
    if (!focusBlockId) return;
    editorRef.current?.focusBlock(focusBlockId);
    studio.focusBlock(null);
  }, [focusBlockId, studio]);

  const targetName = target === STAGE_TARGET_ID ? 'Stage' : (project?.objects.find((o) => o.id === target)?.name ?? 'Stage');
  return (
    <div className="script-editor">
      <div className="panel-head">
        <h2>Scripts</h2>
        <span className="target-name" data-testid="script-target">
          {targetName}
        </span>
        {runState === 'running' && <span className="muted">(running: edits apply on the next Run)</span>}
      </div>
      {loadError && (
        <div className="banner error" role="alert" data-testid="script-load-error">
          These scripts could not be opened: {loadError}. They are kept in the project unchanged and cannot be edited here.
        </div>
      )}
      <div className="blockly-host" ref={hostRef} data-testid="blockly" />
    </div>
  );
}
