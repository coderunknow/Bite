import { useState } from 'react';
import { useAppStore } from '../store';
import { revertProject } from '../actions';

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} data-testid="toast">
          <span>{t.text}</span>
          <button className="icon" aria-label="Dismiss" onClick={() => useAppStore.getState().dismissToast(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function Banners() {
  const recovered = useAppStore((s) => s.recoveredChanges);
  const warning = useAppStore((s) => s.backendWarning);
  const audioBlocked = useAppStore((s) => s.audioBlocked);
  const mode = useAppStore((s) => s.mode);
  return (
    <>
      {warning && (
        <div className="banner warn" role="alert" data-testid="backend-warning">
          {warning}
        </div>
      )}
      {recovered && (
        <div className="banner info" role="status" data-testid="recovery-banner">
          <span>Recovered unsaved changes from your last session.</span>
          <button onClick={() => useAppStore.getState().dismissRecovery()}>Keep changes</button>
          <button
            className="danger"
            onClick={() =>
              useAppStore.getState().setConfirm({
                title: 'Discard recovered changes?',
                body: 'The project returns to its last explicitly saved version.',
                confirmLabel: 'Discard changes',
                danger: true,
                onConfirm: () => void revertProject(),
              })
            }
          >
            Discard changes
          </button>
        </div>
      )}
      {audioBlocked && mode !== 'edit' && (
        <div className="banner info" role="status" data-testid="audio-blocked">
          Sound is blocked by the browser until you interact with the page. Press Run again to enable sound.
        </div>
      )}
    </>
  );
}

export function ConfirmDialog() {
  const confirm = useAppStore((s) => s.confirm);
  const [typed, setTyped] = useState('');
  if (!confirm) return null;
  const close = () => {
    setTyped('');
    useAppStore.getState().setConfirm(null);
  };
  const needsText = confirm.typeToConfirm !== undefined;
  const ok = !needsText || typed === confirm.typeToConfirm;
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" data-testid="confirm-dialog">
        <h2 id="confirm-title">{confirm.title}</h2>
        <p>{confirm.body}</p>
        {needsText && (
          <label className="field">
            <span className="field-label">Type “{confirm.typeToConfirm}” to confirm</span>
            <input className="text" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Confirmation text" data-testid="confirm-text" autoFocus />
          </label>
        )}
        <div className="button-row end">
          <button onClick={close}>Cancel</button>
          <button
            className={confirm.danger ? 'danger' : ''}
            disabled={!ok}
            data-testid="confirm-ok"
            onClick={() => {
              const fn = confirm.onConfirm;
              close();
              fn();
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
