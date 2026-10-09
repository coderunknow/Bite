import { useState } from 'react';
import { useAppStore } from '../store';
import { createProject, deleteProject, duplicateProject, importProjectFile, openProject, renameProject } from '../actions';

export function ProjectsDialog() {
  const open = useAppStore((s) => s.projectsOpen);
  const projects = useAppStore((s) => s.projects);
  const currentId = useAppStore((s) => s.projectId);
  const [newName, setNewName] = useState('My project');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  if (!open) return null;
  const close = () => useAppStore.getState().setProjectsOpen(false);
  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="projects-title" data-testid="projects-dialog">
        <div className="panel-head">
          <h2 id="projects-title">Projects</h2>
          <button className="icon" onClick={close} aria-label="Close projects">
            ✕
          </button>
        </div>
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            void createProject(newName.trim() || 'Untitled project');
          }}
        >
          <input className="text" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New project name" data-testid="new-project-name" />
          <button type="submit" data-testid="new-project">
            New project
          </button>
          <label className="button-like">
            Import .bite
            <input
              type="file"
              accept=".bite,.zip,application/zip"
              hidden
              data-testid="projects-import-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void importProjectFile(f);
              }}
            />
          </label>
        </form>
        <table className="project-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Last changed</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className={p.id === currentId ? 'current' : ''} data-testid={`project-row-${p.name}`}>
                <td>
                  {renaming?.id === p.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void renameProject(p.id, renaming.name);
                        setRenaming(null);
                      }}
                    >
                      <input className="text" autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: p.id, name: e.target.value })} onBlur={() => setRenaming(null)} aria-label="Rename project" />
                    </form>
                  ) : (
                    <button className="link" onClick={() => void openProject(p.id)} data-testid="open-project">
                      {p.name}
                    </button>
                  )}
                  {p.id === currentId && <span className="tag">open</span>}
                </td>
                <td className="muted small">{new Date(p.updatedAt).toLocaleString()}</td>
                <td className="row-actions">
                  <button onClick={() => setRenaming({ id: p.id, name: p.name })}>Rename</button>
                  <button onClick={() => void duplicateProject(p.id)}>Duplicate</button>
                  <button
                    className="danger"
                    onClick={() =>
                      useAppStore.getState().setConfirm({
                        title: `Delete “${p.name}”?`,
                        body: 'The project, its scripts and all of its sounds are removed from this browser. Export it first if you may need it again.',
                        confirmLabel: 'Delete project',
                        typeToConfirm: p.name,
                        danger: true,
                        onConfirm: () => void deleteProject(p.id),
                      })
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {projects.length === 0 && <p className="muted">No projects yet.</p>}
      </div>
    </div>
  );
}
