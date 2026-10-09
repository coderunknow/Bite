import { useAppStore } from '../store';
import { addObject, childrenOf } from '../../editor/edit';
import type { ObjectKind, Project, SceneObject } from '../../model/types';
import { KIND_LABELS } from '../../model/defaults';
import { STAGE_ID } from '../studio';

const ADDABLE: ObjectKind[] = ['cube', 'sphere', 'cylinder', 'plane', 'light', 'camera', 'group'];

export function Hierarchy() {
  const project = useAppStore((s) => s.project);
  const selection = useAppStore((s) => s.selection);
  const mode = useAppStore((s) => s.mode);
  const locked = mode !== 'edit';
  if (!project) return <aside className="hierarchy" />;
  const add = (kind: ObjectKind) => {
    const { project: next, id } = addObject(useAppStore.getState().project!, kind);
    useAppStore.getState().edit(() => next);
    useAppStore.getState().select(id);
  };
  return (
    <aside className="hierarchy" aria-label="Scene hierarchy" data-testid="hierarchy">
      <div className="panel-head">
        <h2>Scene</h2>
      </div>
      <div className="add-grid" role="group" aria-label="Add object">
        {ADDABLE.map((k) => (
          <button key={k} disabled={locked} data-testid={`add-${k}`} onClick={() => add(k)} title={`Add ${KIND_LABELS[k]}`}>
            + {KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <ul className="tree" role="tree">
        <li>
          <button className={selection === STAGE_ID ? 'row selected' : 'row'} role="treeitem" aria-selected={selection === STAGE_ID} data-testid="row-stage" onClick={() => useAppStore.getState().select(STAGE_ID)}>
            <span className="kind">◎</span> Stage
          </button>
        </li>
        <Branch project={project} parentId={null} depth={0} selection={selection} />
      </ul>
      {project.objects.length === 0 && <p className="muted pad">Add an object to start building your scene.</p>}
    </aside>
  );
}

function Branch({ project, parentId, depth, selection }: { project: Project; parentId: string | null; depth: number; selection: string | null }) {
  const children: SceneObject[] = parentId === null ? project.objects.filter((o) => !o.parentId || !project.objects.some((p) => p.id === o.parentId)) : childrenOf(project, parentId);
  return (
    <>
      {children.map((o) => (
        <li key={o.id}>
          <button
            className={selection === o.id ? 'row selected' : 'row'}
            role="treeitem"
            aria-selected={selection === o.id}
            data-testid={`row-${o.name}`}
            style={{ paddingLeft: 10 + depth * 16 }}
            onClick={() => useAppStore.getState().select(o.id)}
          >
            <span className="kind">{KIND_GLYPH[o.kind]}</span> {o.name}
            {!o.visible && <span className="tag">hidden</span>}
          </button>
          <ul role="group">
            <Branch project={project} parentId={o.id} depth={depth + 1} selection={selection} />
          </ul>
        </li>
      ))}
    </>
  );
}

const KIND_GLYPH: Record<ObjectKind, string> = { cube: '■', sphere: '●', cylinder: '▮', plane: '▬', group: '▣', light: '☀', camera: '📷' };
