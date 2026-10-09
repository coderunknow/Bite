import { newId } from './ids';
import { identityTransform } from './transform';
import {
  PROJECT_FORMAT,
  PROJECT_FORMAT_VERSION,
  type MaterialSettings,
  type ObjectKind,
  type PhysicsSettings,
  type Project,
  type SceneObject,
  type Transform,
  type Vec3,
} from './types';
import type { BuiltInSoundDescriptor } from './builtInSounds';

export const APP_VERSION = '0.1.0-beta1';

export const DEFAULT_GRAVITY: Vec3 = [0, -9.81, 0];

export function defaultMaterial(color = '#4c97ff'): MaterialSettings {
  return { color, opacity: 1, metalness: 0, roughness: 0.6 };
}

export function defaultPhysics(kind: ObjectKind): PhysicsSettings {
  const hasVolume = kind === 'cube' || kind === 'sphere' || kind === 'cylinder';
  return {
    bodyType: hasVolume ? 'dynamic' : 'none',
    shape: 'auto',
    mass: 1,
    friction: 0.6,
    restitution: 0.2,
    gravityScale: 1,
    lockRotation: false,
  };
}

const KIND_COLORS: Record<ObjectKind, string> = {
  cube: '#4c97ff',
  sphere: '#ff6680',
  cylinder: '#59c059',
  plane: '#9aa4b2',
  group: '#9966ff',
  light: '#ffd34d',
  camera: '#ff8c1a',
};

const KIND_NAMES: Record<ObjectKind, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  plane: 'Plane',
  group: 'Group',
  light: 'Light',
  camera: 'Camera',
};

/** Creates a new scene object of the given kind with sensible defaults. Name is made unique by the caller. */
export function createSceneObject(kind: ObjectKind, name?: string, transform?: Partial<Transform>): SceneObject {
  const base = identityTransform();
  const t: Transform = { ...base, ...transform };
  if (kind === 'plane') t.scale = [t.scale[0] === 1 ? 10 : t.scale[0], 1, t.scale[2] === 1 ? 10 : t.scale[2]];
  return {
    id: newId(),
    name: name ?? KIND_NAMES[kind],
    kind,
    parentId: null,
    visible: true,
    transform: t,
    material: defaultMaterial(KIND_COLORS[kind]),
    physics: defaultPhysics(kind),
    light: kind === 'light' ? { kind: 'directional', intensity: 1 } : null,
    camera: kind === 'camera' ? { fov: 50 } : null,
    variables: [],
    scripts: [],
  };
}

export const KIND_LABELS: Record<ObjectKind, string> = KIND_NAMES;

export function createProject(name: string, now = new Date()): Project {
  const iso = now.toISOString();
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    id: newId(),
    name,
    createdAt: iso,
    updatedAt: iso,
    settings: {
      gravity: [...DEFAULT_GRAVITY] as Vec3,
      backgroundColor: '#1d2433',
      shadows: true,
      stageCamera: { position: [0, 4, 12], target: [0, 1, 0], fov: 50 },
      activeCameraId: null,
      masterVolume: 100,
    },
    stage: { id: 'stage', name: 'Stage', variables: [], scripts: [] },
    objects: [],
    messages: [],
    sounds: [],
  };
}

/** A starter project: a ground, a dynamic cube with a keyboard-driven jump, and a sun. */
export function createStarterProject(name: string, sounds: readonly BuiltInSoundDescriptor[] = [], now = new Date()): Project {
  const project = createProject(name, now);
  const ground = createSceneObject('plane', 'Ground', { position: [0, 0, 0] });
  ground.physics = { ...defaultPhysics('plane'), bodyType: 'static' };
  ground.material = defaultMaterial('#3c4a5e');
  ground.material.roughness = 0.9;

  const cube = createSceneObject('cube', 'Cube', { position: [0, 3, 0] });
  const jumpScriptId = newId();
  const jumpHatId = newId();
  const impulseId = newId();
  const sayId = newId();
  cube.scripts = [
    {
      id: jumpScriptId,
      position: { x: 40, y: 40 },
      nodes: [
        { id: jumpHatId, opcode: 'event_whenkeypressed', fields: { KEY: 'space' } },
        {
          id: impulseId,
          opcode: 'physics_applyImpulse',
          inputs: { X: 0, Y: 6, Z: 0 },
        },
        { id: sayId, opcode: 'looks_say', inputs: { MESSAGE: 'Boing!', SECS: 1.5 } },
      ],
    },
  ];

  const sun = createSceneObject('light', 'Sun', { position: [4, 8, 4], rotation: [-50, 30, 0] });
  project.objects = [ground, cube, sun];
  project.settings.activeCameraId = null;
  project.sounds = sounds.map((s) => ({ ...s.asset }));
  return project;
}
