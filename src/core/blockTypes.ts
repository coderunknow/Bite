/**
 * Catalog of every block type Bite supports. The Blockly definitions (editor), the toolbox,
 * and the runtime implementations are all checked against this list by tests, so every block
 * shown to the user has a defined runtime behavior (see DESIGN_LOG.md, R2 / section 5).
 */
export const BLOCK_CATEGORIES = ['events', 'motion', 'looks', 'sound', 'control', 'sensing', 'operators', 'variables', 'physics', 'internal'] as const;
export type BlockCategory = (typeof BLOCK_CATEGORIES)[number];

export type BlockShape = 'hat' | 'stack' | 'c' | 'cap' | 'number' | 'text' | 'boolean' | 'any' | 'value';

export interface BlockSpec {
  type: string;
  category: BlockCategory | 'internal';
  shape: BlockShape;
  /** Whether the block can be used on the Stage (which has no position or appearance). */
  stageAllowed: boolean;
}

const s = (type: string, category: BlockCategory | 'internal', shape: BlockShape, stageAllowed = false): BlockSpec => ({ type, category, shape, stageAllowed });

export const BLOCK_SPECS: readonly BlockSpec[] = [
  // Events
  s('event_whenflagclicked', 'events', 'hat', true),
  s('event_whenkeypressed', 'events', 'hat', true),
  s('event_whenthisspriteclicked', 'events', 'hat'),
  s('event_whenbroadcastreceived', 'events', 'hat', true),
  s('event_broadcast', 'events', 'stack', true),
  s('event_broadcastandwait', 'events', 'stack', true),

  // Motion (3D)
  s('motion_moveforward', 'motion', 'stack'),
  s('motion_turnright', 'motion', 'stack'),
  s('motion_turnleft', 'motion', 'stack'),
  s('motion_pointtowards', 'motion', 'stack'),
  s('motion_setposition', 'motion', 'stack'),
  s('motion_changeposition', 'motion', 'stack'),
  s('motion_setrotation', 'motion', 'stack'),
  s('motion_changerotation', 'motion', 'stack'),
  s('motion_gotoxyz', 'motion', 'stack'),
  s('motion_glide', 'motion', 'stack'),
  s('motion_getposition', 'motion', 'number'),
  s('motion_getrotation', 'motion', 'number'),

  // Looks
  s('looks_show', 'looks', 'stack'),
  s('looks_hide', 'looks', 'stack'),
  s('looks_say', 'looks', 'stack'),
  s('looks_sayfor', 'looks', 'stack'),
  s('looks_clearspeech', 'looks', 'stack'),
  s('looks_setcolor', 'looks', 'stack'),
  s('looks_setopacity', 'looks', 'stack'),
  s('looks_changeopacity', 'looks', 'stack'),
  s('looks_setsize', 'looks', 'stack'),
  s('looks_changesize', 'looks', 'stack'),
  s('looks_size', 'looks', 'number'),
  s('looks_isvisible', 'looks', 'boolean'),

  // Sound
  s('sound_play', 'sound', 'stack', true),
  s('sound_playuntildone', 'sound', 'stack', true),
  s('sound_stop', 'sound', 'stack', true),
  s('sound_stopall', 'sound', 'stack', true),
  s('sound_setvolume', 'sound', 'stack'),
  s('sound_changevolume', 'sound', 'stack'),
  s('sound_volume', 'sound', 'number'),

  // Control
  s('control_wait', 'control', 'stack', true),
  s('control_repeat', 'control', 'c', true),
  s('control_forever', 'control', 'cap', true),
  s('control_if', 'control', 'c', true),
  s('control_if_else', 'control', 'c', true),
  s('control_wait_until', 'control', 'stack', true),
  s('control_repeat_until', 'control', 'c', true),
  s('control_stop', 'control', 'cap', true),

  // Sensing
  s('sensing_keypressed', 'sensing', 'boolean', true),
  s('sensing_mousedown', 'sensing', 'boolean', true),
  s('sensing_touching', 'sensing', 'boolean'),
  s('sensing_distanceto', 'sensing', 'number'),
  s('sensing_of', 'sensing', 'any'),
  s('sensing_timer', 'sensing', 'number', true),
  s('sensing_resettimer', 'sensing', 'stack', true),

  // Operators
  s('operator_add', 'operators', 'number', true),
  s('operator_subtract', 'operators', 'number', true),
  s('operator_multiply', 'operators', 'number', true),
  s('operator_divide', 'operators', 'number', true),
  s('operator_mod', 'operators', 'number', true),
  s('operator_round', 'operators', 'number', true),
  s('operator_mathop', 'operators', 'number', true),
  s('operator_random', 'operators', 'number', true),
  s('operator_lt', 'operators', 'boolean', true),
  s('operator_equals', 'operators', 'boolean', true),
  s('operator_gt', 'operators', 'boolean', true),
  s('operator_and', 'operators', 'boolean', true),
  s('operator_or', 'operators', 'boolean', true),
  s('operator_not', 'operators', 'boolean', true),
  s('operator_join', 'operators', 'text', true),
  s('operator_length', 'operators', 'number', true),

  // Variables
  s('data_variable', 'variables', 'any', true),
  s('data_setvariableto', 'variables', 'stack', true),
  s('data_changevariableby', 'variables', 'stack', true),

  // Physics (3D)
  s('physics_impulse', 'physics', 'stack'),
  s('physics_setvelocity', 'physics', 'stack'),
  s('physics_getvelocity', 'physics', 'number'),
  s('physics_setgravity', 'physics', 'stack', true),

  // Literal value blocks: shadow blocks that hold typed inputs. They are not offered in the toolbox.
  s('bite_number', 'internal', 'number', true),
  s('bite_text', 'internal', 'text', true),
  s('bite_color', 'internal', 'text', true),
];

export const BLOCK_SPEC_BY_TYPE: ReadonlyMap<string, BlockSpec> = new Map(BLOCK_SPECS.map((spec) => [spec.type, spec]));

export const HAT_BLOCK_TYPES = new Set(BLOCK_SPECS.filter((b) => b.shape === 'hat').map((b) => b.type));

/** Operator names for `operator_mathop`. */
export const MATH_OPERATORS = ['abs', 'floor', 'ceil', 'sqrt', 'sin', 'cos', 'tan', 'ln'] as const;
export type MathOperator = (typeof MATH_OPERATORS)[number];

/** Axis choices for position and rotation blocks. */
export const AXIS_CHOICES = ['x', 'y', 'z'] as const;
export type AxisChoice = (typeof AXIS_CHOICES)[number];

/** Properties that the "of" sensing block can read. */
export const SENSING_PROPERTIES = ['x position', 'y position', 'z position', 'x rotation', 'y rotation', 'z rotation', 'size', 'visible'] as const;

export const STOP_OPTIONS = ['all', 'this script', 'other scripts in object'] as const;
