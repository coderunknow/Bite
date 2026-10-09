/** Shared primitive types for the Bite domain model. */

/** A 3-component vector: [x, y, z]. */
export type Vec3 = [number, number, number];

/** Object kinds available in the scene. `group` is an empty container used for hierarchy. */
export const OBJECT_KINDS = ['group', 'cube', 'sphere', 'cylinder', 'plane', 'light', 'camera', 'model'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export const PRIMITIVE_KINDS = ['cube', 'sphere', 'cylinder', 'plane'] as const;
export type PrimitiveKind = (typeof PRIMITIVE_KINDS)[number];

export const PHYSICS_MODES = ['none', 'static', 'dynamic', 'kinematic'] as const;
export type PhysicsMode = (typeof PHYSICS_MODES)[number];

export type VariableScope = 'global' | 'local';

/** Blockly serialization of a workspace (Blockly.serialization.workspaces.save output). */
export type ScriptsJSON = Record<string, unknown> & {
  blocks?: { languageVersion?: number; blocks: Array<Record<string, unknown>> };
};

/** Special target id for the stage (scene-level scripts). */
export const STAGE_TARGET_ID = 'stage';

/** Id value used in object dropdowns to mean "any object". */
export const ANY_OBJECT_ID = '__any__';
