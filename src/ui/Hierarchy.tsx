import { useState } from 'react';
import type { Studio } from '../app/studio';
import { childrenOf } from '../core/sceneOps';
import type { Project, SceneObject } from '../core/project';
import { useStudio } from './useStudio';
import { STAGE_TARGET_ID, type ObjectKind } from '../core/types';

/** Kinds offered in the Add menu. Model import is not part of this beta. */
const ADDABLE: Array<[ObjectKind, string]> = [
  ['cube', 'Cube'],
  ['sphere', 'Sphere'],
  ['cylinder', 'Cylinder'],
  ['plane', 'Plane'],
  ['group', 'Group'],
  ['light', 'Light'],
  ['camera', 'Camera'],
];

const KIND_ICON: Record<ObjectKind, string> = {
  cube: '■',
  sphere: '●',
  cylinder: '⬮',
  plane: '▬',
  group: '▣',
  light: '☀',
  camera: '🎥',
  model: '⬡',
};

interface Row {
  object: SceneObject;
  depth: number;
}

/** Depth-first list of objects, children under their parent. */
function flatten(project: Project): Row[] {
  const rows: Row[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const object of childrenOf(project, parentId)) {
      rows.push({ object, depth });
      walk(object.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

export function Hierarchy({ studio }: { studio: Studio }) {
  const project = useStudio(studio, (s) => s.project);
  const selectedId = useStudio(studio, (s) => s.selectedId);
  const scriptTarget = useStudio(studio, (s) => s.scriptTarget);
  const runState = useStudio(studio, (s) => s.runState);
  const [kind, setKind] = useState<ObjectKind>('cube');
  if (!project) return null;
  const running = runState === 'running';
  const selected = project.objects.find((o) => o.id === selectedId);
  const rows = flatten(project);

  return (
    <div className="hierarchy">
      <div className="panel-head">
        <h2>Objects</h2>
        <span className="muted">{project.objects.length}</span>
      </div>
      <div className="add-row">
        <select value={kind} onChange={(e) => setKind(e.target.value as ObjectKind)} aria-label="Object type" data-testid="add-kind" disabled={running}>
          {ADDABLE.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => studio.createObject(kind)} disabled={running} data-testid="add-object">
          Add
        </button>
      </div>
      <p className="hint">Adding while a group is selected places the new object inside that group.</p>
      <ul className="tree" role="tree" data-testid="hierarchy">
        <li>
          <button
            type="button"
            className={`row ${scriptTarget === STAGE_TARGET_ID && !selectedId ? 'on' : ''}`}
            onClick={() => studio.selectObject(null)}
            data-testid="row-stage"
          >
            <span className="icon">🎬</span>
            <span className="name">Stage</span>
          </button>
        </li>
        {rows.map(({ object, depth }) => (
          <li key={object.id}>
            <button
              type="button"
              className={`row ${selectedId === object.id ? 'on' : ''}`}
              style={{ paddingLeft: 10 + depth * 16 }}
              onClick={() => studio.selectObject(object.id)}
              data-testid={`row-${object.name}`}
              aria-selected={selectedId === object.id}
            >
              <span className="icon" aria-hidden="true">{KIND_ICON[object.kind]}</span>
              <span className="name">{object.name}</span>
              {!object.visible && <span className="tag">hidden</span>}
              {object.physics.mode !== 'none' && <span className="tag physics">{object.physics.mode}</span>}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="row-actions">
          <button type="button" onClick={() => studio.duplicateSelected()} disabled={running} data-testid="duplicate-object">
            Duplicate
          </button>
          <button
            type="button"
            className="danger"
            disabled={running}
            onClick={() => {
              if (window.confirm(`Delete "${selected.name}"${childrenOf(project, selected.id).length ? ' and everything inside it' : ''}? This cannot be undone.`)) {
                studio.deleteSelected();
              }
            }}
            data-testid="delete-object"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
