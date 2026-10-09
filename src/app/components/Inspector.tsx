import { useAppStore } from '../store';
import { addMessage, addVariable, deleteMessage, deleteVariable, deleteObject, duplicateObject, findObject, patchObject, patchVariable, renameMessage, renameObject, setParent, subtreeIds } from '../../editor/edit';
import { BODY_TYPES, COLLIDER_SHAPES, type Project, type SceneObject, type Vec3 } from '../../model/types';
import { CheckField, ColorField, NumberField, Section, SelectField, TextField } from './fields';
import { useState } from 'react';
import { STAGE_ID } from '../studio';

const KIND_LABEL: Record<SceneObject['kind'], string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  plane: 'Plane',
  group: 'Group',
  light: 'Light',
  camera: 'Camera',
};

const BODY_LABEL: Record<string, string> = { none: 'None (no physics)', static: 'Static (fixed)', dynamic: 'Dynamic (simulated)', kinematic: 'Kinematic (script-driven)' };
const SHAPE_LABEL: Record<string, string> = { auto: 'Automatic', box: 'Box', sphere: 'Sphere', cylinder: 'Cylinder' };

export function Inspector() {
  const project = useAppStore((s) => s.project);
  const selection = useAppStore((s) => s.selection);
  const mode = useAppStore((s) => s.mode);
  if (!project) return <aside className="inspector empty">Loading…</aside>;
  const locked = mode !== 'edit';
  const obj = selection && selection !== STAGE_ID ? findObject(project, selection) : undefined;
  return (
    <aside className="inspector" data-testid="inspector">
      {locked && <div className="notice">Editing is locked during Play. Stop or Reset to edit.</div>}
      {obj ? <ObjectInspector project={project} object={obj} locked={locked} /> : <StageInspector project={project} locked={locked} />}
    </aside>
  );
}

function run(fn: (p: Project) => Project) {
  useAppStore.getState().edit(fn);
}

function StageInspector({ project, locked }: { project: Project; locked: boolean }) {
  const s = project.settings;
  const [newMessage, setNewMessage] = useState('');
  const [newVar, setNewVar] = useState('');
  return (
    <div className="inspector-body" data-testid="stage-inspector">
      <h2 className="inspector-title">Stage</h2>
      <Section title="Scene">
        <NumberField label="Gravity X" testId="gravity-x" value={s.gravity[0]} disabled={locked} step={0.5} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, gravity: setVec(p.settings.gravity, 0, v) } }))} />
        <NumberField label="Gravity Y" testId="gravity-y" value={s.gravity[1]} disabled={locked} step={0.5} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, gravity: setVec(p.settings.gravity, 1, v) } }))} />
        <NumberField label="Gravity Z" testId="gravity-z" value={s.gravity[2]} disabled={locked} step={0.5} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, gravity: setVec(p.settings.gravity, 2, v) } }))} />
        <ColorField label="Background" testId="background" value={s.backgroundColor} disabled={locked} onCommit={(hex) => run((p) => ({ ...p, settings: { ...p.settings, backgroundColor: hex } }))} />
        <CheckField label="Shadows" testId="shadows" checked={s.shadows} disabled={locked} onChange={(v) => run((p) => ({ ...p, settings: { ...p.settings, shadows: v } }))} />
        <NumberField label="Master volume %" testId="master-volume" value={s.masterVolume} disabled={locked} step={5} min={0} max={100} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, masterVolume: v } }))} />
        <SelectField
          label="Play camera"
          testId="active-camera"
          value={s.activeCameraId ?? ''}
          disabled={locked}
          options={[{ value: '', label: 'Stage camera' }, ...project.objects.filter((o) => o.kind === 'camera').map((c) => ({ value: c.id, label: c.name }))]}
          onChange={(v) => run((p) => ({ ...p, settings: { ...p.settings, activeCameraId: v || null } }))}
        />
      </Section>
      <Section title="Stage camera (used when Play starts with no scene camera)">
        <NumberField label="Position X" value={s.stageCamera.position[0]} disabled={locked} step={0.5} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, stageCamera: { ...p.settings.stageCamera, position: setVec(p.settings.stageCamera.position, 0, v) } } }))} />
        <NumberField label="Position Y" value={s.stageCamera.position[1]} disabled={locked} step={0.5} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, stageCamera: { ...p.settings.stageCamera, position: setVec(p.settings.stageCamera.position, 1, v) } } }))} />
        <NumberField label="Position Z" value={s.stageCamera.position[2]} disabled={locked} step={0.5} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, stageCamera: { ...p.settings.stageCamera, position: setVec(p.settings.stageCamera.position, 2, v) } } }))} />
        <NumberField label="Field of view" value={s.stageCamera.fov} disabled={locked} step={1} min={10} max={120} onCommit={(v) => run((p) => ({ ...p, settings: { ...p.settings, stageCamera: { ...p.settings.stageCamera, fov: v } } }))} />
      </Section>
      <Section title="Variables (all objects can use these)">
        <VariableList project={project} target="stage" locked={locked} />
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newVar.trim()) return;
            run((p) => addVariable(p, 'stage', newVar));
            setNewVar('');
          }}
        >
          <input className="text" placeholder="New variable" value={newVar} disabled={locked} onChange={(e) => setNewVar(e.target.value)} aria-label="New stage variable" />
          <button type="submit" disabled={locked}>Add</button>
        </form>
      </Section>
      <Section title="Messages (broadcast names)">
        {project.messages.length === 0 && <p className="muted">No messages yet. Messages connect "broadcast" and "when I receive" blocks.</p>}
        {project.messages.map((m) => (
          <div className="list-row" key={m}>
            <TextField label={`Message ${m}`} value={m} disabled={locked} onCommit={(v) => run((p) => renameMessage(p, m, v))} />
            <button className="icon" disabled={locked} title="Delete message" onClick={() => run((p) => deleteMessage(p, m))}>✕</button>
          </div>
        ))}
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newMessage.trim()) return;
            run((p) => addMessage(p, newMessage));
            setNewMessage('');
          }}
        >
          <input className="text" placeholder="New message" value={newMessage} disabled={locked} onChange={(e) => setNewMessage(e.target.value)} aria-label="New message" />
          <button type="submit" disabled={locked}>Add</button>
        </form>
      </Section>
    </div>
  );
}

function setVec(v: Vec3, i: number, x: number): Vec3 {
  const out: Vec3 = [...v] as Vec3;
  out[i] = x;
  return out;
}

function VariableList({ project, target, locked }: { project: Project; target: string; locked: boolean }) {
  const vars = target === 'stage' ? project.stage.variables : findObject(project, target)?.variables ?? [];
  return (
    <>
      {vars.length === 0 && <p className="muted">No variables.</p>}
      {vars.map((v) => (
        <div className="var-row" key={v.id} data-testid={`variable-${v.name}`}>
          <TextField label={`Variable name ${v.name}`} value={v.name} disabled={locked} onCommit={(name) => run((p) => patchVariable(p, target, v.id, { name }))} />
          <TextField
            label={`Value of ${v.name}`}
            value={String(v.value)}
            disabled={locked}
            onCommit={(text) => {
              const n = Number(text);
              run((p) => patchVariable(p, target, v.id, { value: text.trim() !== '' && Number.isFinite(n) ? n : text }));
            }}
          />
          <button className="icon" disabled={locked} title="Delete variable" onClick={() => run((p) => deleteVariable(p, target, v.id))}>✕</button>
        </div>
      ))}
    </>
  );
}

function ObjectInspector({ project, object, locked }: { project: Project; object: SceneObject; locked: boolean }) {
  const o = object;
  const [newVar, setNewVar] = useState('');
  const parentOptions = [{ value: '', label: 'None (scene root)' }, ...project.objects.filter((x) => !subtreeIds(project, o.id).includes(x.id)).map((x) => ({ value: x.id, label: x.name }))];
  const hasBody = o.kind === 'cube' || o.kind === 'sphere' || o.kind === 'cylinder' || o.kind === 'plane';
  const hasMaterial = hasBody;
  const patch = (fn: (x: SceneObject) => void) => run((p) => patchObject(p, o.id, fn));
  return (
    <div className="inspector-body" data-testid="object-inspector">
      <h2 className="inspector-title">{KIND_LABEL[o.kind]}</h2>
      <TextField label="Name" testId="object-name" value={o.name} disabled={locked} onCommit={(name) => run((p) => renameObject(p, o.id, name))} />
      <div className="button-row">
        <button
          disabled={locked}
          onClick={() => {
            const { project: next, id } = duplicateObject(useAppStore.getState().project!, o.id);
            useAppStore.getState().edit(() => next);
            useAppStore.getState().select(id);
          }}
        >
          Duplicate
        </button>
        <button
          className="danger"
          disabled={locked}
          onClick={() => {
            const count = subtreeIds(project, o.id).length;
            useAppStore.getState().setConfirm({
              title: `Delete "${o.name}"?`,
              body: count > 1 ? `This also deletes ${count - 1} child object(s). This cannot be undone after you save.` : 'This cannot be undone after you save.',
              confirmLabel: 'Delete object',
              danger: true,
              onConfirm: () => {
                useAppStore.getState().edit((p) => deleteObject(p, o.id));
                useAppStore.getState().select(null);
              },
            });
          }}
        >
          Delete
        </button>
      </div>
      <Section title="Hierarchy">
        <SelectField label="Parent" testId="object-parent" value={o.parentId ?? ''} disabled={locked} options={parentOptions} onChange={(v) => run((p) => setParent(p, o.id, v || null))} />
        {o.parentId && <p className="muted small">Physics applies to top-level objects only. Children move with their parent.</p>}
        <CheckField label="Visible" testId="object-visible" checked={o.visible} disabled={locked} onChange={(v) => patch((x) => (x.visible = v))} />
      </Section>
      <Section title="Transform">
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumberField key={`p${axis}`} label={`Position ${axis}`} testId={`pos-${axis.toLowerCase()}`} value={o.transform.position[i]!} disabled={locked} onCommit={(v) => patch((x) => (x.transform.position[i] = v))} />
        ))}
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumberField key={`r${axis}`} label={`Rotation ${axis}°`} testId={`rot-${axis.toLowerCase()}`} value={o.transform.rotation[i]!} step={5} disabled={locked} onCommit={(v) => patch((x) => (x.transform.rotation[i] = v))} />
        ))}
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <NumberField key={`s${axis}`} label={`Scale ${axis}`} testId={`scale-${axis.toLowerCase()}`} value={o.transform.scale[i]!} min={0.01} disabled={locked} onCommit={(v) => patch((x) => (x.transform.scale[i] = v))} />
        ))}
      </Section>
      {hasMaterial && (
        <Section title="Look">
          <ColorField label="Colour" testId="color" value={o.material.color} disabled={locked} onCommit={(hex) => patch((x) => (x.material.color = hex))} />
          <NumberField label="Opacity" testId="opacity" value={o.material.opacity} step={0.1} min={0} max={1} disabled={locked} onCommit={(v) => patch((x) => (x.material.opacity = v))} />
          <NumberField label="Metalness" testId="metalness" value={o.material.metalness} step={0.1} min={0} max={1} disabled={locked} onCommit={(v) => patch((x) => (x.material.metalness = v))} />
          <NumberField label="Roughness" testId="roughness" value={o.material.roughness} step={0.1} min={0} max={1} disabled={locked} onCommit={(v) => patch((x) => (x.material.roughness = v))} />
        </Section>
      )}
      {o.kind === 'light' && o.light && (
        <Section title="Light">
          <SelectField label="Type" value={o.light.kind} disabled={locked} options={[{ value: 'directional', label: 'Directional (sun)' }, { value: 'point', label: 'Point' }]} onChange={(v) => patch((x) => (x.light = { kind: v as 'directional' | 'point', intensity: x.light?.intensity ?? 1 }))} />
          <NumberField label="Intensity" testId="light-intensity" value={o.light.intensity} step={0.1} min={0} max={10} disabled={locked} onCommit={(v) => patch((x) => (x.light = { kind: x.light?.kind ?? 'directional', intensity: v }))} />
        </Section>
      )}
      {o.kind === 'camera' && o.camera && (
        <Section title="Camera">
          <NumberField label="Field of view" value={o.camera.fov} step={1} min={10} max={120} disabled={locked} onCommit={(v) => patch((x) => (x.camera = { fov: v }))} />
          <p className="muted small">Select this camera in Scene settings (Play camera) to view the scene through it.</p>
        </Section>
      )}
      {hasBody && (
        <Section title="Physics">
          <SelectField label="Body type" testId="body-type" value={o.physics.bodyType} disabled={locked || Boolean(o.parentId)} options={BODY_TYPES.map((b) => ({ value: b, label: BODY_LABEL[b] ?? b }))} onChange={(v) => patch((x) => (x.physics.bodyType = v as SceneObject['physics']['bodyType']))} />
          {o.physics.bodyType !== 'none' && (
            <>
              <SelectField label="Collider" value={o.physics.shape} disabled={locked} options={COLLIDER_SHAPES.map((s) => ({ value: s, label: SHAPE_LABEL[s] ?? s }))} onChange={(v) => patch((x) => (x.physics.shape = v as SceneObject['physics']['shape']))} />
              <NumberField label="Mass (kg)" testId="mass" value={o.physics.mass} step={0.5} min={0.001} disabled={locked} onCommit={(v) => patch((x) => (x.physics.mass = v))} />
              <NumberField label="Friction" value={o.physics.friction} step={0.1} min={0} max={2} disabled={locked} onCommit={(v) => patch((x) => (x.physics.friction = v))} />
              <NumberField label="Bounciness" value={o.physics.restitution} step={0.1} min={0} max={1} disabled={locked} onCommit={(v) => patch((x) => (x.physics.restitution = v))} />
              <NumberField label="Gravity scale" value={o.physics.gravityScale} step={0.1} min={0} max={10} disabled={locked} onCommit={(v) => patch((x) => (x.physics.gravityScale = v))} />
              <CheckField label="Lock rotation" checked={o.physics.lockRotation} disabled={locked} onChange={(v) => patch((x) => (x.physics.lockRotation = v))} />
            </>
          )}
        </Section>
      )}
      <Section title="Variables (this object only)">
        <VariableList project={project} target={o.id} locked={locked} />
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newVar.trim()) return;
            run((p) => addVariable(p, o.id, newVar));
            setNewVar('');
          }}
        >
          <input className="text" placeholder="New variable" value={newVar} disabled={locked} onChange={(e) => setNewVar(e.target.value)} aria-label="New object variable" />
          <button type="submit" disabled={locked}>Add</button>
        </form>
      </Section>
    </div>
  );
}
