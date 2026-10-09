/**
 * Project document model, its on-disk schema (format `bite.project` v1), defaults,
 * and semantic validation. See DESIGN_LOG.md decision D-15 for the format decision.
 */
import { z } from 'zod';
import { OBJECT_KINDS, PHYSICS_MODES, type ObjectKind, type PhysicsMode, type Vec3, type ScriptsJSON } from './types';

export const PROJECT_FORMAT = 'bite.project' as const;
export const PROJECT_FORMAT_VERSION = 1 as const;
export const APP_VERSION = '0.1.0-beta1';
export const MAX_NAME_LENGTH = 80;
export const MAX_PROJECT_JSON_BYTES = 20 * 1024 * 1024;

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const Vec3Schema = z.tuple([finite, finite, finite]);
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb color');
const IdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'contains invalid characters');
const NameSchema = z.string().min(1, 'must not be empty').max(MAX_NAME_LENGTH, `must be at most ${MAX_NAME_LENGTH} characters`);
const AssetIdSchema = z.string().regex(/^[a-f0-9]{64}$/, 'must be a SHA-256 hex digest');
const IsoDateSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO date');

const ScriptsSchema = z
  .looseObject({
    blocks: z
      .looseObject({
        languageVersion: z.number().optional(),
        blocks: z.array(z.record(z.string(), z.unknown())),
      })
      .optional(),
  });

const TransformSchema = z.object({
  position: Vec3Schema,
  rotation: Vec3Schema,
  scale: Vec3Schema,
});

const SceneObjectSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  kind: z.enum(OBJECT_KINDS),
  parentId: IdSchema.nullable(),
  visible: z.boolean(),
  transform: TransformSchema,
  material: z.object({
    color: HexColorSchema,
    opacity: z.number().min(0).max(1),
    roughness: z.number().min(0).max(1),
    metalness: z.number().min(0).max(1),
  }),
  light: z.object({ color: HexColorSchema, intensity: z.number().min(0).max(1000) }).optional(),
  camera: z.object({ fov: z.number().min(10).max(120) }).optional(),
  model: z.object({ assetId: AssetIdSchema, size: Vec3Schema }).optional(),
  physics: z.object({
    mode: z.enum(PHYSICS_MODES),
    mass: z.number().positive().max(1_000_000),
    friction: z.number().min(0).max(5),
    restitution: z.number().min(0).max(1),
  }),
  soundVolume: z.number().min(0).max(100),
  scripts: ScriptsSchema,
});

const VariableSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  scope: z.enum(['global', 'local']),
  ownerId: IdSchema.nullable(),
  value: z.union([finite, z.string().max(100_000), z.boolean()]),
});

const MessageSchema = z.object({ id: IdSchema, name: NameSchema });

const SoundSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  assetId: AssetIdSchema,
});

export const ProjectSettingsSchema = z.object({
  gravity: Vec3Schema,
  background: HexColorSchema,
  gridVisible: z.boolean(),
  stageCameraId: IdSchema.nullable(),
});

export const ProjectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  formatVersion: z.literal(PROJECT_FORMAT_VERSION),
  appVersion: z.string().max(64),
  id: IdSchema,
  name: NameSchema,
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  settings: ProjectSettingsSchema,
  objects: z.array(SceneObjectSchema),
  variables: z.array(VariableSchema),
  messages: z.array(MessageSchema),
  sounds: z.array(SoundSchema),
  stage: z.object({ scripts: ScriptsSchema }),
});

export type SceneObject = z.infer<typeof SceneObjectSchema>;
export type ProjectVariable = z.infer<typeof VariableSchema>;
export type ProjectMessage = z.infer<typeof MessageSchema>;
export type ProjectSound = z.infer<typeof SoundSchema>;
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export class ProjectValidationError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'ProjectValidationError';
    this.issues = issues;
  }
}

/** Default display colour of each object kind (used when an object is created). */
export const DEFAULT_COLORS: Record<ObjectKind, string> = {
  group: '#9aa5b1',
  cube: '#4c97ff',
  sphere: '#9966ff',
  cylinder: '#ffab19',
  plane: '#59c059',
  light: '#fff3c4',
  camera: '#5b4bff',
  model: '#cfd8dc',
};

export const DEFAULT_OBJECT_NAMES: Record<ObjectKind, string> = {
  group: 'Group',
  cube: 'Cube',
  sphere: 'Sphere',
  cylinder: 'Cylinder',
  plane: 'Plane',
  light: 'Light',
  camera: 'Camera',
  model: 'Model',
};

export function defaultPhysicsMode(kind: ObjectKind): PhysicsMode {
  // Planes are usually the floor: static by default. Everything else is non-physical until enabled.
  return kind === 'plane' ? 'static' : 'none';
}

export function defaultObjectTransform(kind: ObjectKind): SceneObject['transform'] {
  // Primitives rest on the ground: the origin is half the height above y = 0.
  const restY = kind === 'plane' || kind === 'group' || kind === 'camera' ? 0 : kind === 'light' ? 2 : 0.5;
  const position: Vec3 = kind === 'camera' ? [0, 2, 8] : [0, restY, 0];
  return {
    position,
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
}

export function createSceneObject(input: { id: string; name: string; kind: ObjectKind; parentId?: string | null; scripts?: ScriptsJSON }): SceneObject {
  const kind = input.kind;
  const base: SceneObject = {
    id: input.id,
    name: input.name,
    kind,
    parentId: input.parentId ?? null,
    visible: true,
    transform: defaultObjectTransform(kind),
    material: { color: DEFAULT_COLORS[kind], opacity: 1, roughness: 0.5, metalness: 0 },
    physics: { mode: defaultPhysicsMode(kind), mass: 1, friction: 0.6, restitution: 0.2 },
    soundVolume: 100,
    scripts: (input.scripts ?? {}) as SceneObject['scripts'],
  };
  if (kind === 'light') base.light = { color: '#fff3c4', intensity: 40 };
  if (kind === 'camera') base.camera = { fov: 60 };
  return base;
}

/** An empty project with default settings. Starter objects and sounds are added by `templates.ts`. */
export function createEmptyProject(input: { id: string; name: string; now: Date }): Project {
  const iso = input.now.toISOString();
  return {
    format: PROJECT_FORMAT,
    formatVersion: PROJECT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    id: input.id,
    name: input.name,
    createdAt: iso,
    updatedAt: iso,
    settings: {
      gravity: [0, -9.81, 0],
      background: '#e7eef8',
      gridVisible: true,
      stageCameraId: null,
    },
    objects: [],
    variables: [],
    messages: [],
    sounds: [],
    stage: { scripts: {} },
  };
}

/** Returns semantic problems that the JSON schema cannot express. Empty array means valid. */
export function findProjectProblems(project: Project): string[] {
  const problems: string[] = [];
  const objectIds = new Map<string, SceneObject>();
  for (const obj of project.objects) {
    if (objectIds.has(obj.id)) problems.push(`Duplicate object id "${obj.id}".`);
    objectIds.set(obj.id, obj);
  }
  for (const obj of project.objects) {
    if (obj.parentId !== null) {
      if (!objectIds.has(obj.parentId)) {
        problems.push(`Object "${obj.name}" refers to missing parent "${obj.parentId}".`);
      } else {
        // Walk up the chain; a cycle would never reach a root.
        const seen = new Set<string>([obj.id]);
        let cursor: string | null = obj.parentId;
        while (cursor !== null) {
          if (seen.has(cursor)) {
            problems.push(`Object "${obj.name}" is part of a parent cycle.`);
            break;
          }
          seen.add(cursor);
          cursor = objectIds.get(cursor)?.parentId ?? null;
        }
      }
    }
    if (obj.kind === 'light' && !obj.light) problems.push(`Light "${obj.name}" has no light settings.`);
    if (obj.kind === 'camera' && !obj.camera) problems.push(`Camera "${obj.name}" has no camera settings.`);
    if (obj.kind === 'model' && !obj.model) problems.push(`Model "${obj.name}" has no model asset.`);
  }
  if (project.settings.stageCameraId !== null) {
    const cam = objectIds.get(project.settings.stageCameraId);
    if (!cam || cam.kind !== 'camera') problems.push('The stage camera refers to a missing camera object.');
  }

  const varIds = new Set<string>();
  const globalNames = new Set<string>();
  const localNames = new Map<string, Set<string>>();
  for (const v of project.variables) {
    if (varIds.has(v.id)) problems.push(`Duplicate variable id "${v.id}".`);
    varIds.add(v.id);
    if (v.scope === 'global') {
      if (v.ownerId !== null) problems.push(`Global variable "${v.name}" must not have an owner.`);
      const key = v.name.toLowerCase();
      if (globalNames.has(key)) problems.push(`Two global variables are named "${v.name}".`);
      globalNames.add(key);
    } else {
      if (v.ownerId === null || !objectIds.has(v.ownerId)) {
        problems.push(`Local variable "${v.name}" has no existing owner object.`);
      } else {
        const owner = v.ownerId;
        const names = localNames.get(owner) ?? new Set<string>();
        const key = v.name.toLowerCase();
        if (names.has(key)) problems.push(`Object "${objectIds.get(owner)?.name}" has two local variables named "${v.name}".`);
        names.add(key);
        localNames.set(owner, names);
      }
    }
  }
  for (const [owner, names] of localNames) {
    for (const name of names) {
      if (globalNames.has(name)) {
        problems.push(`Local variable "${name}" of "${objectIds.get(owner)?.name}" conflicts with a global variable.`);
      }
    }
  }

  const messageIds = new Set<string>();
  const messageNames = new Set<string>();
  for (const m of project.messages) {
    if (messageIds.has(m.id)) problems.push(`Duplicate message id "${m.id}".`);
    if (messageNames.has(m.name)) problems.push(`Two messages are named "${m.name}".`);
    messageIds.add(m.id);
    messageNames.add(m.name);
  }
  const soundIds = new Set<string>();
  for (const s of project.sounds) {
    if (soundIds.has(s.id)) problems.push(`Duplicate sound id "${s.id}".`);
    soundIds.add(s.id);
  }
  return problems;
}

/**
 * Validates an unknown value against the project schema and the semantic rules.
 * Throws ProjectValidationError with readable issues; never returns partial data.
 */
export function parseProject(value: unknown): Project {
  const result = ProjectSchema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 20).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new ProjectValidationError('The project file does not match the Bite project format.', issues);
  }
  const problems = findProjectProblems(result.data);
  if (problems.length > 0) {
    throw new ProjectValidationError('The project file is internally inconsistent.', problems.slice(0, 20));
  }
  return result.data;
}
