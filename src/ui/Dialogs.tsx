import { useState, type FormEvent } from 'react';
import type { Studio, DialogState } from '../app/studio';
import { useStudio } from './useStudio';
import { Modal, SelectField } from './common';
import { MAX_NAME_LENGTH } from '../core/project';

export function Dialogs({ studio }: { studio: Studio }) {
  const dialog = useStudio(studio, (s) => s.dialog);
  if (!dialog) return null;
  const close = () => studio.openDialog(null);
  return <DialogView key={dialog.type + ('projectId' in dialog ? dialog.projectId : '')} studio={studio} dialog={dialog} close={close} />;
}

function DialogView({ studio, dialog, close }: { studio: Studio; dialog: NonNullable<DialogState>; close: () => void }) {
  switch (dialog.type) {
    case 'new-project':
      return <NameDialog title="New project" label="Project name" initial="Untitled project" submitLabel="Create" onClose={close} onSubmit={(name) => studio.createProject(name)} />;
    case 'rename-project':
      return <RenameProjectDialog studio={studio} projectId={dialog.projectId} onClose={close} />;
    case 'duplicate-project':
      return <DuplicateDialog studio={studio} projectId={dialog.projectId} onClose={close} />;
    case 'delete-project':
      return <DeleteDialog studio={studio} projectId={dialog.projectId} onClose={close} />;
    case 'open-project':
      return <OpenDialog studio={studio} onClose={close} />;
    case 'import':
      return <ImportDialog studio={studio} onClose={close} />;
    case 'new-variable':
      return <NewVariableDialog studio={studio} onClose={close} />;
    case 'new-message':
      return <NameDialog title="New message" label="Message name" initial="" submitLabel="Create" onClose={close} onSubmit={(name) => studio.createMessage(name)} />;
  }
}

function NameDialog(props: { title: string; label: string; initial: string; submitLabel: string; onClose: () => void; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(props.initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) props.onSubmit(name.trim());
  };
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>{props.label}</span>
          <input autoFocus value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} data-testid="dialog-name" />
        </label>
        <div className="actions">
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!name.trim()} data-testid="dialog-submit">
            {props.submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function projectNameOf(studio: Studio, id: string): string {
  return studio.store.getState().projects.find((p) => p.id === id)?.name ?? '';
}

function RenameProjectDialog({ studio, projectId, onClose }: { studio: Studio; projectId: string; onClose: () => void }) {
  return (
    <NameDialog
      title="Rename project"
      label="New name"
      initial={projectNameOf(studio, projectId)}
      submitLabel="Rename"
      onClose={onClose}
      onSubmit={(name) => void studio.renameProject(projectId, name)}
    />
  );
}

function DuplicateDialog({ studio, projectId, onClose }: { studio: Studio; projectId: string; onClose: () => void }) {
  const source = projectNameOf(studio, projectId);
  return (
    <NameDialog
      title="Duplicate project"
      label="Name for the copy"
      initial={`${source} copy`.slice(0, MAX_NAME_LENGTH)}
      submitLabel="Duplicate"
      onClose={onClose}
      onSubmit={(name) => void studio.duplicateProject(projectId, name)}
    />
  );
}

/** Deleting asks the user to type the project name. Nothing is removed on a mismatch. */
function DeleteDialog({ studio, projectId, onClose }: { studio: Studio; projectId: string; onClose: () => void }) {
  const name = projectNameOf(studio, projectId);
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === name && name !== '';
  return (
    <Modal title="Delete project" onClose={onClose}>
      <div className="form">
        <p>
          This permanently deletes <strong>{name}</strong> and the sounds that only it uses. Sounds shared with other projects are kept. Export a package first if you might need it.
        </p>
        <label className="field">
          <span>Type the project name to confirm</span>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus data-testid="delete-confirm" />
        </label>
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="danger" disabled={!matches} onClick={() => void studio.deleteProject(projectId, typed)} data-testid="delete-submit">
            Delete project
          </button>
        </div>
      </div>
    </Modal>
  );
}

function OpenDialog({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const projects = useStudio(studio, (s) => s.projects);
  const currentId = useStudio(studio, (s) => s.project?.id);
  return (
    <Modal title="Projects" onClose={onClose} wide>
      <div className="form">
        <div className="actions start">
          <button type="button" className="primary" onClick={() => studio.openDialog({ type: 'new-project' })} data-testid="new-project">
            New project
          </button>
          <button type="button" onClick={() => studio.openDialog({ type: 'import' })}>
            Import…
          </button>
        </div>
        <ul className="project-list" data-testid="project-list">
          {projects.map((p) => (
            <li key={p.id} className={p.id === currentId ? 'current' : ''}>
              <div className="stack">
                <strong>{p.name}</strong>
                <span className="muted small">Last changed {new Date(p.updatedAt).toLocaleString()}</span>
              </div>
              <button type="button" disabled={p.id === currentId} onClick={() => void studio.openProject(p.id)} data-testid={`open-${p.name}`}>
                {p.id === currentId ? 'Open now' : 'Open'}
              </button>
              <button type="button" onClick={() => studio.openDialog({ type: 'rename-project', projectId: p.id })}>
                Rename
              </button>
              <button type="button" onClick={() => studio.openDialog({ type: 'duplicate-project', projectId: p.id })}>
                Duplicate
              </button>
              <button type="button" className="danger" onClick={() => studio.openDialog({ type: 'delete-project', projectId: p.id })}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function ImportDialog({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Import a project" onClose={onClose}>
      <div className="form">
        <p className="hint">
          Choose a <code>.bite</code> package (with its sounds) or a <code>.json</code> project. The import always creates a new project; existing projects are never overwritten. The file is checked before anything is saved.
        </p>
        <input
          type="file"
          accept=".bite,.json,application/zip,application/json"
          data-testid="import-file"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            await studio.importFile(file);
            setBusy(false);
          }}
        />
        {busy && <p className="muted">Importing…</p>}
      </div>
    </Modal>
  );
}

function NewVariableDialog({ studio, onClose }: { studio: Studio; onClose: () => void }) {
  const project = useStudio(studio, (s) => s.project);
  const selectedId = useStudio(studio, (s) => s.selectedId);
  const owner = selectedId && project?.objects.some((o) => o.id === selectedId) ? selectedId : null;
  const [name, setName] = useState('my variable');
  const [scope, setScope] = useState<'global' | 'local'>('global');
  const valid = name.trim().length > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) studio.createVariable(name.trim(), scope, scope === 'local' ? owner : null);
  };
  return (
    <Modal title="New variable" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="field">
          <span>Variable name</span>
          <input autoFocus value={name} maxLength={MAX_NAME_LENGTH} onChange={(e) => setName(e.target.value)} data-testid="variable-name" />
        </label>
        <SelectField
          label="Available to"
          value={scope === 'local' && owner ? 'local' : 'global'}
          options={[
            ['All objects (global)', 'global'],
            [owner ? `Only ${project?.objects.find((o) => o.id === owner)?.name ?? 'this object'} (local)` : 'Only one object (select it first)', 'local'],
          ]}
          onChange={(v) => setScope(v as 'global' | 'local')}
          testId="variable-scope"
        />
        <p className="hint">Global variables are shared by every object and the Stage. Local variables belong to the selected object.</p>
        {scope === 'local' && !owner && <p className="error-text">Select an object in the hierarchy to make a local variable.</p>}
        <div className="actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid || (scope === 'local' && !owner)} data-testid="dialog-submit">
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
