import { useRef } from 'react';
import type { Studio } from '../app/studio';
import { BUILTIN_SOUNDS } from '../audio/builtins';
import { messageReferenceCount, soundReferenceCount, variableReferenceCount, variablesVisibleTo } from '../core/sceneOps';
import { useStudio } from './useStudio';
import { TextField } from './common';
import { STAGE_TARGET_ID } from '../core/types';

export function SoundsPanel({ studio }: { studio: Studio }) {
  const project = useStudio(studio, (s) => s.project);
  const audioStatus = useStudio(studio, (s) => s.audioStatus);
  const runState = useStudio(studio, (s) => s.runState);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!project) return null;
  const present = new Set(project.sounds.map((s) => s.name));
  return (
    <div className="panel-body" data-testid="sounds-panel">
      {audioStatus !== 'running' && audioStatus !== 'unsupported' && (
        <div className="callout">
          <p>Browsers block sound until you interact with the page.</p>
          <button type="button" onClick={() => void studio.enableAudio()} data-testid="enable-audio-panel">
            Enable sound
          </button>
        </div>
      )}
      <h3>Project sounds</h3>
      {project.sounds.length === 0 && <p className="muted">No sounds yet. Add a built-in sound or import a file below.</p>}
      <ul className="list">
        {project.sounds.map((sound) => {
          const refs = soundReferenceCount(project, sound.id);
          return (
            <li key={sound.id} data-testid={`sound-${sound.name}`}>
              <span className="name">{sound.name}</span>
              <span className="muted small">{refs > 0 ? `used by ${refs} block(s)` : 'unused'}</span>
              <button type="button" onClick={() => void studio.previewSound(sound.id)} disabled={runState === 'running'} title="Play">
                ▶
              </button>
              <button type="button" className="danger" disabled={refs > 0} onClick={() => studio.removeSound(sound.id)} title={refs > 0 ? 'Remove the blocks that use this sound first' : 'Delete'}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <h3>Built-in sounds</h3>
      <p className="hint">Generated in your browser. No downloads.</p>
      <div className="chip-row">
        {BUILTIN_SOUNDS.map((b) => (
          <button key={b.name} type="button" disabled={present.has(b.name)} onClick={() => void studio.addBuiltinSound(b.name)} data-testid={`add-builtin-${b.name}`}>
            + {b.name}
          </button>
        ))}
      </div>
      <h3>Import a sound</h3>
      <p className="hint">WAV, MP3, OGG or M4A up to 25 MB. The file is stored inside the project and in exported packages.</p>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.m4a,.aac,.flac"
        data-testid="sound-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void studio.addSoundFile(file);
        }}
      />
    </div>
  );
}

export function VariablesPanel({ studio }: { studio: Studio }) {
  const project = useStudio(studio, (s) => s.project);
  const selectedId = useStudio(studio, (s) => s.selectedId);
  const runState = useStudio(studio, (s) => s.runState);
  if (!project) return null;
  const owner = selectedId;
  const visible = variablesVisibleTo(project, owner ?? STAGE_TARGET_ID);
  const ownerName = (ownerId: string | null) => (ownerId === null ? 'all sprites' : (project.objects.find((o) => o.id === ownerId)?.name ?? 'deleted object'));
  const locked = runState === 'running';
  return (
    <div className="panel-body" data-testid="variables-panel">
      <div className="panel-head">
        <h3>Variables</h3>
        <button type="button" onClick={() => studio.openDialog({ type: 'new-variable' })} disabled={locked}>
          New variable
        </button>
      </div>
      <p className="hint">Showing variables for {owner ? (project.objects.find((o) => o.id === owner)?.name ?? 'the object') : 'the Stage'}. Global variables are shared.</p>
      <ul className="list">
        {visible.map((variable) => {
          const refs = variableReferenceCount(project, variable.id);
          return (
            <li key={variable.id} className="variable" data-testid={`variable-${variable.name}`}>
              <div className="stack">
                <TextField label={variable.scope === 'global' ? 'Global' : `Local to ${ownerName(variable.ownerId)}`} value={variable.name} maxLength={80} onCommit={(name) => studio.renameVariable(variable.id, name)} />
              </div>
              <label className="field">
                <span>Starting value</span>
                <input
                  defaultValue={String(variable.value)}
                  key={`${variable.id}-${String(variable.value)}`}
                  disabled={locked}
                  onBlur={(e) => {
                    if (e.target.value !== String(variable.value)) studio.setVariableInitialValue(variable.id, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
              </label>
              <button type="button" className="danger" disabled={locked || refs > 0} onClick={() => studio.removeVariable(variable.id)} title={refs > 0 ? `Used by ${refs} block(s)` : 'Delete variable'}>
                Delete
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="muted">No variables for this target.</li>}
      </ul>
      <div className="panel-head">
        <h3>Messages</h3>
        <button type="button" onClick={() => studio.openDialog({ type: 'new-message' })} disabled={locked}>
          New message
        </button>
      </div>
      <ul className="list">
        {project.messages.map((message) => {
          const refs = messageReferenceCount(project, message.id);
          return (
            <li key={message.id}>
              <span className="name">{message.name}</span>
              <span className="muted small">{refs > 0 ? `${refs} block(s)` : 'unused'}</span>
              <button type="button" className="danger" disabled={refs > 0} onClick={() => studio.removeMessage(message.id)} title={refs > 0 ? 'Remove blocks that use it first' : 'Delete message'}>
                ×
              </button>
            </li>
          );
        })}
        {project.messages.length === 0 && <li className="muted">No messages. Messages let objects signal each other.</li>}
      </ul>
    </div>
  );
}

