import type { Studio } from '../app/studio';
import type { Project, SceneObject } from '../core/project';
import { childrenOf, subtreeOf } from '../core/sceneOps';
import { useStudio } from './useStudio';
import { CheckField, ColorField, NumberField, SelectField, Section, TextField, VectorField } from './common';
import { PHYSICS_MODES, type PhysicsMode } from '../core/types';

const PHYSICS_HELP: Record<PhysicsMode, string> = {
  none: 'No physics. The object only moves when scripts move it.',
  static: 'Fixed in place. Other bodies collide with it.',
  dynamic: 'Falls under gravity and collides. Use the Physics blocks to push or set velocity.',
  kinematic: 'Moved by scripts, collides with dynamic bodies.',
};

const PHYSICAL_KINDS = new Set(['cube', 'sphere', 'cylinder', 'plane', 'model']);

export function Inspector({ studio }: { studio: Studio }) {
  const project = useStudio(studio, (s) => s.project);
  const selectedId = useStudio(studio, (s) => s.selectedId);
  const runState = useStudio(studio, (s) => s.runState);
  if (!project) return null;
  const object = project.objects.find((o) => o.id === selectedId);
  if (!object) return <StageSettings studio={studio} project={project} disabled={runState === 'running'} />;
  return <ObjectInspector key={object.id} studio={studio} project={project} object={object} disabled={runState === 'running'} />;
}

function ObjectInspector({ studio, project, object, disabled }: { studio: Studio; project: Project; object: SceneObject; disabled: boolean }) {
  const id = object.id;
  const edit = (label: string, change: (o: SceneObject) => void) => studio.updateObject(id, label, (o) => change(o));
  const inSubtree = new Set(subtreeOf(project, id).map((o) => o.id));
  const parentOptions: Array<[string, string]> = [
    ['(none — top level)', ''],
    ...project.objects.filter((o) => o.kind === 'group' && !inSubtree.has(o.id)).map((o): [string, string] => [o.name, o.id]),
  ];
  const isMesh = object.kind !== 'group' && object.kind !== 'camera' && object.kind !== 'light';
  const physical = PHYSICAL_KINDS.has(object.kind);
  const children = childrenOf(project, id).length;

  return (
    <div className="inspector" data-testid="inspector">
      <Section title={`${object.kind[0]!.toUpperCase()}${object.kind.slice(1)}`}>
        <TextField label="Name" value={object.name} maxLength={80} testId="object-name" onCommit={(name) => studio.renameObject(id, name)} />
        <CheckField label="Visible" checked={object.visible} testId="object-visible" onChange={(visible) => edit('Visibility', (o) => (o.visible = visible))} />
        <SelectField
          label="Parent group"
          value={object.parentId ?? ''}
          options={parentOptions}
          testId="object-parent"
          onChange={(value) => studio.setObjectParent(id, value || null)}
        />
        {children > 0 && <p className="hint">Contains {children} object(s). Moving the group moves them too.</p>}
      </Section>

      <Section title="Transform">
        <VectorField label="Position (m)" value={object.transform.position} step={0.1} testPrefix="pos" onCommit={(position) => studio.setTransform(id, { position })} />
        <VectorField label="Rotation (degrees)" value={object.transform.rotation} step={1} testPrefix="rot" onCommit={(rotation) => studio.setTransform(id, { rotation })} />
        <VectorField label="Scale" value={object.transform.scale} step={0.1} min={0.001} testPrefix="scale" onCommit={(scale) => studio.setTransform(id, { scale })} />
      </Section>

      {isMesh && (
        <Section title="Appearance">
          <ColorField label="Colour" value={object.material.color} testId="object-color" onChange={(color) => edit('Colour', (o) => (o.material.color = color))} />
          <Slider label="Opacity" value={object.material.opacity} onChange={(v) => edit('Opacity', (o) => (o.material.opacity = v))} />
          <Slider label="Roughness" value={object.material.roughness} onChange={(v) => edit('Roughness', (o) => (o.material.roughness = v))} />
          <Slider label="Metalness" value={object.material.metalness} onChange={(v) => edit('Metalness', (o) => (o.material.metalness = v))} />
        </Section>
      )}

      {object.kind === 'light' && object.light && (
        <Section title="Light">
          <ColorField label="Colour" value={object.light.color} onChange={(color) => edit('Light colour', (o) => (o.light = { ...o.light!, color }))} />
          <NumberField label="Intensity" value={object.light.intensity} min={0} max={1000} step={1} onCommit={(intensity) => edit('Light intensity', (o) => (o.light = { ...o.light!, intensity }))} />
        </Section>
      )}

      {object.kind === 'camera' && object.camera && (
        <Section title="Camera">
          <NumberField label="Field of view (°)" value={object.camera.fov} min={10} max={120} step={1} onCommit={(fov) => edit('Field of view', (o) => (o.camera = { fov }))} />
          <p className="hint">Choose which camera the Scene view uses in Stage settings.</p>
        </Section>
      )}

      {physical ? (
        <Section title="Physics">
          <SelectField
            label="Body type"
            value={object.physics.mode}
            testId="physics-mode"
            options={PHYSICS_MODES.map((m): [string, string] => [capitalise(m), m])}
            onChange={(mode) => edit('Physics mode', (o) => (o.physics.mode = mode as PhysicsMode))}
          />
          <p className="hint">{PHYSICS_HELP[object.physics.mode]}</p>
          <NumberField label="Mass (kg)" value={object.physics.mass} min={0.001} max={1000000} step={0.1} testId="physics-mass" onCommit={(mass) => edit('Mass', (o) => (o.physics.mass = mass))} />
          <Slider label="Friction" value={object.physics.friction} max={5} onChange={(v) => edit('Friction', (o) => (o.physics.friction = v))} />
          <Slider label="Bounciness" value={object.physics.restitution} onChange={(v) => edit('Bounciness', (o) => (o.physics.restitution = v))} />
        </Section>
      ) : (
        <p className="hint">Groups, lights and cameras have no physics.</p>
      )}

      <Section title="Sound">
        <Slider label="Volume" value={object.soundVolume} max={100} step={1} onChange={(v) => edit('Sound volume', (o) => (o.soundVolume = v))} />
        <p className="hint">Sound blocks from this object use this volume. Blocks can change it while the program runs.</p>
      </Section>
      {disabled && <p className="hint">Stop the program to edit properties.</p>}
    </div>
  );
}

function StageSettings({ studio, project, disabled }: { studio: Studio; project: Project; disabled: boolean }) {
  const cameras: Array<[string, string]> = [
    ['(default camera)', ''],
    ...project.objects.filter((o) => o.kind === 'camera').map((o): [string, string] => [o.name, o.id]),
  ];
  return (
    <div className="inspector" data-testid="stage-settings">
      <p className="hint">Nothing is selected. Select an object in the list or the viewport, or change the stage below.</p>
      <Section title="Stage">
        <VectorField label="Gravity (m/s²)" value={project.settings.gravity} step={0.1} testPrefix="gravity" onCommit={(gravity) => studio.setSettings({ gravity })} />
        <ColorField label="Background" value={project.settings.background} onChange={(background) => studio.setSettings({ background })} />
        <CheckField label="Show grid in editor" checked={project.settings.gridVisible} onChange={(gridVisible) => studio.setSettings({ gridVisible })} />
        <SelectField
          label="Scene camera"
          value={project.settings.stageCameraId ?? ''}
          options={cameras}
          testId="stage-camera"
          onChange={(value) => studio.setSettings({ stageCameraId: value || null })}
        />
        <p className="hint">The Scene camera view follows the chosen camera object. With none, a default camera is used.</p>
      </Section>
      <Section title="Project">
        <p className="muted">
          {project.objects.length} object(s), {project.sounds.length} sound(s), {project.variables.length} variable(s), {project.messages.length} message(s).
        </p>
      </Section>
      {disabled && <p className="hint">Stop the program to change the stage.</p>}
    </div>
  );
}

function Slider(props: { label: string; value: number; onChange: (value: number) => void; max?: number; step?: number }) {
  const { label, value, onChange, max = 1, step = 0.05 } = props;
  return (
    <label className="field slider">
      <span>
        {label} <output>{Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}</output>
      </span>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
