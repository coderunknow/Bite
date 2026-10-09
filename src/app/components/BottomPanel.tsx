import { useRef } from 'react';
import { useAppStore } from '../store';
import { addSoundFile, previewSound, removeSound } from '../actions';
import { STAGE_ID } from '../studio';
import { MAX_SOUND_BYTES } from '../persistence';

export function BottomPanel() {
  const tab = useAppStore((s) => s.bottomTab);
  const setTab = useAppStore((s) => s.setBottomTab);
  return (
    <section className="bottom" aria-label="Console and sounds">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'console'} className={tab === 'console' ? 'tab active' : 'tab'} onClick={() => setTab('console')} data-testid="tab-console">
          Console
        </button>
        <button role="tab" aria-selected={tab === 'sounds'} className={tab === 'sounds' ? 'tab active' : 'tab'} onClick={() => setTab('sounds')} data-testid="tab-sounds">
          Sounds
        </button>
      </div>
      {tab === 'console' ? <Console /> : <Sounds />}
    </section>
  );
}

function Console() {
  const entries = useAppStore((s) => s.diagnostics);
  const project = useAppStore((s) => s.project);
  const clear = () => useAppStore.getState().setDiagnostics([]);
  /** Opens the code of the object that produced the message (or the Stage) in the code editor. */
  const go = (targetId: string | null) => {
    const st = useAppStore.getState();
    if (!st.project || targetId === null) return;
    if (targetId !== STAGE_ID && !st.project.objects.some((o) => o.id === targetId)) return;
    const target = targetId;
    st.select(target);
    st.setTab('code');
  };
  return (
    <div className="console" data-testid="console">
      <div className="console-head">
        <span className="muted small">{entries.length === 0 ? 'No messages. Press Run to start.' : `${entries.length} message(s)`}</span>
        <button onClick={clear} disabled={entries.length === 0}>
          Clear
        </button>
      </div>
      <ol className="log">
        {entries.map((e) => {
          const name = e.targetId === null ? 'Project' : e.targetId === STAGE_ID ? 'Stage' : project?.objects.find((o) => o.id === e.targetId)?.name ?? '(removed object)';
          return (
            <li key={e.id} className={`log-${e.level}`} data-testid="log-entry">
              <span className="log-level">{e.level === 'error' ? '✖' : e.level === 'warning' ? '⚠' : 'ℹ'}</span>
              <button className="link" disabled={e.targetId === null} onClick={() => go(e.targetId)} title="Open the code for this message">
                {name}
              </button>
              <span className="log-text">{e.message}</span>
              {e.count > 1 && <span className="tag">×{e.count}</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Sounds() {
  const project = useAppStore((s) => s.project);
  const mode = useAppStore((s) => s.mode);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!project) return null;
  const locked = mode === 'running';
  return (
    <div className="sounds" data-testid="sounds">
      <div className="console-head">
        <span className="muted small">Sounds are stored in this project and bundled on export. Supported: WAV, MP3, OGG, FLAC, M4A (max 25 MB each).</span>
        <button onClick={() => inputRef.current?.click()} disabled={locked} data-testid="add-sound">
          Add sound…
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".wav,.mp3,.ogg,.oga,.flac,.m4a,.aac,audio/*"
          hidden
          data-testid="sound-file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > MAX_SOUND_BYTES) {
              useAppStore.getState().toast('That sound is larger than 25 MB.', 'error');
              return;
            }
            void addSoundFile(f);
          }}
        />
      </div>
      {project.sounds.length === 0 && <p className="muted pad">No sounds yet.</p>}
      <ul className="sound-list">
        {project.sounds.map((s) => (
          <li key={s.id} data-testid={`sound-${s.name}`}>
            <span>{s.name}</span>
            {s.builtIn && <span className="tag">built-in</span>}
            <button onClick={() => void previewSound(s.id)} aria-label={`Play ${s.name}`}>
              ▶ Preview
            </button>
            {!s.builtIn && (
              <button
                className="danger"
                disabled={locked}
                onClick={() =>
                  useAppStore.getState().setConfirm({
                    title: `Remove "${s.name}"?`,
                    body: 'Scripts that play this sound will report a missing sound until you choose another.',
                    confirmLabel: 'Remove sound',
                    danger: true,
                    onConfirm: () => void removeSound(s.id),
                  })
                }
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
