/**
 * Block catalog: the single source of truth for every block shown in the editor.
 *
 * Each entry declares the opcode, its category, its shape, which targets can use it and its inputs.
 * The Blockly definitions (blockDefinitions.ts), the toolbox (toolbox.ts) and the runtime coverage test
 * are all derived from this list. A block that appears here must have a runtime implementation
 * (enforced by tests/unit/catalog.test.ts), so no displayed block is decorative.
 *
 * Label syntax: `[NAME]` is a value input or dropdown field, `{NAME}` is a statement input (C-block body).
 */
import { SUPPORTED_KEYS } from '../model/types';

export type CategoryId =
  | 'events'
  | 'motion'
  | 'physics'
  | 'looks'
  | 'sound'
  | 'control'
  | 'sensing'
  | 'operators'
  | 'variables'
  | 'scene';

export interface CategorySpec {
  id: CategoryId;
  label: string;
  colour: string;
  /** Which target types show this category in the toolbox. */
  targets: ('object' | 'stage')[];
}

export const CATEGORIES: readonly CategorySpec[] = [
  { id: 'events', label: 'Events', colour: '#FFBF00', targets: ['object', 'stage'] },
  { id: 'motion', label: 'Motion', colour: '#4C97FF', targets: ['object'] },
  { id: 'physics', label: 'Physics', colour: '#17B5A6', targets: ['object'] },
  { id: 'looks', label: 'Looks', colour: '#9966FF', targets: ['object'] },
  { id: 'sound', label: 'Sound', colour: '#CF63CF', targets: ['object', 'stage'] },
  { id: 'control', label: 'Control', colour: '#FFAB19', targets: ['object', 'stage'] },
  { id: 'sensing', label: 'Sensing', colour: '#5CB1D6', targets: ['object', 'stage'] },
  { id: 'operators', label: 'Operators', colour: '#59C059', targets: ['object', 'stage'] },
  { id: 'variables', label: 'Variables', colour: '#FF8C1A', targets: ['object', 'stage'] },
  { id: 'scene', label: 'Scene', colour: '#E0566C', targets: ['stage'] },
];

export type BlockShape =
  /** Event hat: starts a script, has no previous connection. */
  | 'hat'
  /** Ordinary command block. */
  | 'statement'
  /** Command block with one or more statement inputs (C-block). Has previous and next. */
  | 'c-block'
  /** Command block that ends a stack (no next connection), e.g. forever. */
  | 'c-terminal'
  /** Value-producing block. */
  | 'reporter'
  /** Value-producing block that produces a boolean. */
  | 'boolean';

export type DropdownSource =
  | { kind: 'static'; options: readonly { label: string; value: string }[] }
  | { kind: 'keys' }
  | { kind: 'objects' }
  | { kind: 'objectsAndAny' }
  | { kind: 'cameras' }
  | { kind: 'variables' }
  | { kind: 'messages' }
  | { kind: 'sounds' };

export type ArgSpec =
  /** Numeric value input. Shadow default is `default`. */
  | { type: 'number'; default: number }
  /** Text value input. Shadow default is `default`. */
  | { type: 'text'; default: string }
  /** Boolean value input (accepts only boolean reporters). */
  | { type: 'boolean' }
  /** Dropdown field. `default` is the value of the first option when omitted. */
  | { type: 'dropdown'; source: DropdownSource; default?: string }
  /** Statement input, used with `{NAME}` tokens. */
  | { type: 'stack' };

export interface BlockSpec {
  opcode: string;
  category: CategoryId;
  shape: BlockShape;
  /** Targets that may use this block. */
  targets: ('object' | 'stage')[];
  label: string;
  args: Record<string, ArgSpec>;
  tooltip: string;
}

const AXES = [
  { label: 'x', value: 'x' },
  { label: 'y', value: 'y' },
  { label: 'z', value: 'z' },
] as const;

const EVERYWHERE: ('object' | 'stage')[] = ['object', 'stage'];
const OBJECT_ONLY: ('object' | 'stage')[] = ['object'];
const STAGE_ONLY: ('object' | 'stage')[] = ['stage'];

export const BLOCK_SPECS: readonly BlockSpec[] = [
  // ---------------------------------------------------------------- Events
  {
    opcode: 'event_whenflagclicked',
    category: 'events',
    shape: 'hat',
    targets: EVERYWHERE,
    label: 'when green flag clicked',
    args: {},
    tooltip: 'Starts this script when the green flag (Run) is pressed.',
  },
  {
    opcode: 'event_whenkeypressed',
    category: 'events',
    shape: 'hat',
    targets: EVERYWHERE,
    label: 'when [KEY] key pressed',
    args: { KEY: { type: 'dropdown', source: { kind: 'keys' }, default: 'space' } },
    tooltip: 'Starts this script when the chosen key goes down while the project is running. "any" matches every key.',
  },
  {
    opcode: 'event_whenthisspriteclicked',
    category: 'events',
    shape: 'hat',
    targets: OBJECT_ONLY,
    label: 'when this object clicked',
    args: {},
    tooltip: 'Starts this script when the object is clicked in the stage while the project is running.',
  },
  {
    opcode: 'event_whenbroadcastreceived',
    category: 'events',
    shape: 'hat',
    targets: EVERYWHERE,
    label: 'when I receive [MESSAGE]',
    args: { MESSAGE: { type: 'dropdown', source: { kind: 'messages' } } },
    tooltip: 'Starts this script when the message is broadcast.',
  },
  {
    opcode: 'event_broadcast',
    category: 'events',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'broadcast [MESSAGE]',
    args: { MESSAGE: { type: 'dropdown', source: { kind: 'messages' } } },
    tooltip: 'Starts every script that waits for this message. Scripts that are already running for it are restarted.',
  },
  {
    opcode: 'event_broadcastandwait',
    category: 'events',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'broadcast [MESSAGE] and wait',
    args: { MESSAGE: { type: 'dropdown', source: { kind: 'messages' } } },
    tooltip: 'Broadcasts the message and waits until all scripts it started have finished.',
  },

  // ---------------------------------------------------------------- Motion
  {
    opcode: 'motion_moveForward',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'move [DISTANCE] units forward',
    args: { DISTANCE: { type: 'number', default: 1 } },
    tooltip: 'Moves the object along its forward direction (local -Z, including its pitch) by the given distance in metres.',
  },
  {
    opcode: 'motion_turn',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'turn [DIRECTION] [DEGREES] degrees',
    args: {
      DIRECTION: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: '↻ right', value: 'right' },
            { label: '↺ left', value: 'left' },
          ],
        },
        default: 'right',
      },
      DEGREES: { type: 'number', default: 15 },
    },
    tooltip: 'Changes the yaw (rotation about +Y). Turning right (clockwise seen from above) subtracts degrees from yaw.',
  },
  {
    opcode: 'motion_goTo',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'go to x: [X] y: [Y] z: [Z]',
    args: { X: { type: 'number', default: 0 }, Y: { type: 'number', default: 0 }, Z: { type: 'number', default: 0 } },
    tooltip: 'Moves the object to a position (local to its parent). Dynamic physics bodies are teleported and keep their velocity.',
  },
  {
    opcode: 'motion_glide',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'glide [SECS] seconds to x: [X] y: [Y] z: [Z]',
    args: {
      SECS: { type: 'number', default: 1 },
      X: { type: 'number', default: 0 },
      Y: { type: 'number', default: 0 },
      Z: { type: 'number', default: 0 },
    },
    tooltip: 'Moves the object smoothly to a position over the given simulated time.',
  },
  {
    opcode: 'motion_setPosition',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'set [AXIS] position to [VALUE]',
    args: {
      AXIS: { type: 'dropdown', source: { kind: 'static', options: AXES.map((a) => ({ label: a.label, value: a.value })) }, default: 'x' },
      VALUE: { type: 'number', default: 0 },
    },
    tooltip: 'Sets one coordinate of the object position (metres, local to its parent).',
  },
  {
    opcode: 'motion_changePosition',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'change [AXIS] position by [VALUE]',
    args: {
      AXIS: { type: 'dropdown', source: { kind: 'static', options: AXES.map((a) => ({ label: a.label, value: a.value })) }, default: 'x' },
      VALUE: { type: 'number', default: 1 },
    },
    tooltip: 'Adds a value to one coordinate of the object position (metres).',
  },
  {
    opcode: 'motion_setRotation',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'set [AXIS] rotation to [VALUE] degrees',
    args: {
      AXIS: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: 'x (pitch)', value: 'x' },
            { label: 'y (yaw)', value: 'y' },
            { label: 'z (roll)', value: 'z' },
          ],
        },
        default: 'y',
      },
      VALUE: { type: 'number', default: 0 },
    },
    tooltip: 'Sets one Euler rotation angle in degrees (order YXZ). y is the heading: 0 faces -Z.',
  },
  {
    opcode: 'motion_changeRotation',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'change [AXIS] rotation by [VALUE] degrees',
    args: {
      AXIS: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: 'x (pitch)', value: 'x' },
            { label: 'y (yaw)', value: 'y' },
            { label: 'z (roll)', value: 'z' },
          ],
        },
        default: 'y',
      },
      VALUE: { type: 'number', default: 15 },
    },
    tooltip: 'Adds degrees to one Euler rotation angle.',
  },
  {
    opcode: 'motion_pointTowards',
    category: 'motion',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'point towards [TARGET]',
    args: { TARGET: { type: 'dropdown', source: { kind: 'objects' } } },
    tooltip: 'Sets the yaw so that the object faces the target object in the horizontal plane.',
  },
  {
    opcode: 'motion_position',
    category: 'motion',
    shape: 'reporter',
    targets: OBJECT_ONLY,
    label: '[AXIS] position',
    args: {
      AXIS: { type: 'dropdown', source: { kind: 'static', options: AXES.map((a) => ({ label: a.label, value: a.value })) }, default: 'x' },
    },
    tooltip: 'World position of the object along one axis (metres).',
  },
  {
    opcode: 'motion_rotation',
    category: 'motion',
    shape: 'reporter',
    targets: OBJECT_ONLY,
    label: '[AXIS] rotation',
    args: {
      AXIS: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: 'x', value: 'x' },
            { label: 'y', value: 'y' },
            { label: 'z', value: 'z' },
          ],
        },
        default: 'y',
      },
    },
    tooltip: 'Local Euler rotation angle of the object in degrees.',
  },

  // ---------------------------------------------------------------- Physics
  {
    opcode: 'physics_applyImpulse',
    category: 'physics',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'apply impulse x: [X] y: [Y] z: [Z]',
    args: { X: { type: 'number', default: 0 }, Y: { type: 'number', default: 5 }, Z: { type: 'number', default: 0 } },
    tooltip: 'Gives a dynamic body an instantaneous change of momentum (kg·m/s). Ignored with a warning for other body types.',
  },
  {
    opcode: 'physics_setVelocity',
    category: 'physics',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'set velocity x: [X] y: [Y] z: [Z]',
    args: { X: { type: 'number', default: 0 }, Y: { type: 'number', default: 0 }, Z: { type: 'number', default: 0 } },
    tooltip: 'Sets the linear velocity (m/s) of a dynamic body. Ignored with a warning for other body types.',
  },
  {
    opcode: 'physics_velocity',
    category: 'physics',
    shape: 'reporter',
    targets: OBJECT_ONLY,
    label: '[AXIS] velocity',
    args: { AXIS: { type: 'dropdown', source: { kind: 'static', options: AXES.map((a) => ({ label: a.label, value: a.value })) }, default: 'y' } },
    tooltip: 'Linear velocity of the body in m/s. 0 for objects without a physics body.',
  },

  // ---------------------------------------------------------------- Looks
  {
    opcode: 'looks_show',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'show',
    args: {},
    tooltip: 'Makes the object visible.',
  },
  {
    opcode: 'looks_hide',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'hide',
    args: {},
    tooltip: 'Hides the object. Hidden objects keep their physics body.',
  },
  {
    opcode: 'looks_isVisible',
    category: 'looks',
    shape: 'boolean',
    targets: OBJECT_ONLY,
    label: 'visible?',
    args: {},
    tooltip: 'True when the object is shown.',
  },
  {
    opcode: 'looks_setColor',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'set color to [COLOR]',
    args: { COLOR: { type: 'text', default: '#ff6680' } },
    tooltip: 'Sets the base colour as a hex string such as #ff6680.',
  },
  {
    opcode: 'looks_setOpacity',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'set opacity to [PERCENT] %',
    args: { PERCENT: { type: 'number', default: 50 } },
    tooltip: '0 % is fully transparent, 100 % is opaque.',
  },
  {
    opcode: 'looks_setSize',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'set size to [PERCENT] %',
    args: { PERCENT: { type: 'number', default: 100 } },
    tooltip: 'Sets a uniform scale: 100 % is scale 1 on every axis.',
  },
  {
    opcode: 'looks_changeSize',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'change size by [PERCENT] %',
    args: { PERCENT: { type: 'number', default: 10 } },
    tooltip: 'Multiplies every scale axis by (1 + percent / 100).',
  },
  {
    opcode: 'looks_setMaterial',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'set material [PROPERTY] to [VALUE]',
    args: {
      PROPERTY: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: 'metalness', value: 'metalness' },
            { label: 'roughness', value: 'roughness' },
          ],
        },
        default: 'metalness',
      },
      VALUE: { type: 'number', default: 0.5 },
    },
    tooltip: 'Sets a physically based material property between 0 and 1.',
  },
  {
    opcode: 'looks_say',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'say [MESSAGE] for [SECS] seconds',
    args: { MESSAGE: { type: 'text', default: 'Hello!' }, SECS: { type: 'number', default: 2 } },
    tooltip: 'Shows a speech bubble above the object. 0 seconds keeps it until "clear speech bubble" or another say block.',
  },
  {
    opcode: 'looks_clearSay',
    category: 'looks',
    shape: 'statement',
    targets: OBJECT_ONLY,
    label: 'clear speech bubble',
    args: {},
    tooltip: 'Removes the speech bubble of the object.',
  },

  // ---------------------------------------------------------------- Sound
  {
    opcode: 'sound_play',
    category: 'sound',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'start sound [SOUND]',
    args: { SOUND: { type: 'dropdown', source: { kind: 'sounds' } } },
    tooltip: 'Starts playing the sound and continues immediately.',
  },
  {
    opcode: 'sound_playUntilDone',
    category: 'sound',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'play sound [SOUND] until done',
    args: { SOUND: { type: 'dropdown', source: { kind: 'sounds' } } },
    tooltip: 'Plays the sound and waits until it has finished.',
  },
  {
    opcode: 'sound_stop',
    category: 'sound',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'stop sound [SOUND]',
    args: { SOUND: { type: 'dropdown', source: { kind: 'sounds' } } },
    tooltip: 'Stops every playing instance of the sound.',
  },
  {
    opcode: 'sound_stopAll',
    category: 'sound',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'stop all sounds',
    args: {},
    tooltip: 'Stops all sounds that are playing.',
  },
  {
    opcode: 'sound_setVolume',
    category: 'sound',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'set volume to [PERCENT] %',
    args: { PERCENT: { type: 'number', default: 50 } },
    tooltip: 'Sets the master volume (0–100 %). This affects all sounds.',
  },
  {
    opcode: 'sound_changeVolume',
    category: 'sound',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'change volume by [PERCENT]',
    args: { PERCENT: { type: 'number', default: -10 } },
    tooltip: 'Changes the master volume by a number of percentage points, clamped to 0–100.',
  },
  {
    opcode: 'sound_volume',
    category: 'sound',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: 'volume',
    args: {},
    tooltip: 'Current master volume in percent.',
  },

  // ---------------------------------------------------------------- Control
  {
    opcode: 'control_wait',
    category: 'control',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'wait [SECS] seconds',
    args: { SECS: { type: 'number', default: 1 } },
    tooltip: 'Pauses this script for the given simulated time. Other scripts keep running.',
  },
  {
    opcode: 'control_waitUntil',
    category: 'control',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'wait until [CONDITION]',
    args: { CONDITION: { type: 'boolean' } },
    tooltip: 'Pauses this script until the condition becomes true.',
  },
  {
    opcode: 'control_repeat',
    category: 'control',
    shape: 'c-block',
    targets: EVERYWHERE,
    label: 'repeat [TIMES]\n{BODY}',
    args: { TIMES: { type: 'number', default: 10 }, BODY: { type: 'stack' } },
    tooltip: 'Runs the blocks inside the given number of times. Each pass yields to the next frame.',
  },
  {
    opcode: 'control_forever',
    category: 'control',
    shape: 'c-terminal',
    targets: EVERYWHERE,
    label: 'forever\n{BODY}',
    args: { BODY: { type: 'stack' } },
    tooltip: 'Runs the blocks inside repeatedly until the script is stopped. Each pass yields to the next frame, so the page stays responsive.',
  },
  {
    opcode: 'control_repeatUntil',
    category: 'control',
    shape: 'c-block',
    targets: EVERYWHERE,
    label: 'repeat until [CONDITION]\n{BODY}',
    args: { CONDITION: { type: 'boolean' }, BODY: { type: 'stack' } },
    tooltip: 'Runs the blocks inside until the condition becomes true. The condition is checked before each pass.',
  },
  {
    opcode: 'control_if',
    category: 'control',
    shape: 'c-block',
    targets: EVERYWHERE,
    label: 'if [CONDITION] then\n{BODY}',
    args: { CONDITION: { type: 'boolean' }, BODY: { type: 'stack' } },
    tooltip: 'Runs the blocks inside only when the condition is true.',
  },
  {
    opcode: 'control_ifElse',
    category: 'control',
    shape: 'c-block',
    targets: EVERYWHERE,
    label: 'if [CONDITION] then\n{THEN}\nelse\n{ELSE}',
    args: { CONDITION: { type: 'boolean' }, THEN: { type: 'stack' }, ELSE: { type: 'stack' } },
    tooltip: 'Runs the first branch when the condition is true, otherwise the second branch.',
  },
  {
    opcode: 'control_stop',
    category: 'control',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'stop [OPTION]',
    args: {
      OPTION: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: 'this script', value: 'this' },
            { label: 'all scripts', value: 'all' },
            { label: 'other scripts of this object', value: 'others' },
          ],
        },
        default: 'this',
      },
    },
    tooltip: 'Ends the current script, every running script, or the other scripts that belong to this object.',
  },

  // ---------------------------------------------------------------- Sensing
  {
    opcode: 'sensing_keyPressed',
    category: 'sensing',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: 'key [KEY] pressed?',
    args: { KEY: { type: 'dropdown', source: { kind: 'keys' }, default: 'space' } },
    tooltip: 'True while the key is held down. "any" is true while any supported key is held.',
  },
  {
    opcode: 'sensing_mouseDown',
    category: 'sensing',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: 'mouse button pressed?',
    args: {},
    tooltip: 'True while the primary mouse button is held down over the stage.',
  },
  {
    opcode: 'sensing_touching',
    category: 'sensing',
    shape: 'boolean',
    targets: OBJECT_ONLY,
    label: 'touching [TARGET]?',
    args: { TARGET: { type: 'dropdown', source: { kind: 'objectsAndAny' }, default: '__any__' } },
    tooltip:
      'True when this object is in contact with the target. Uses physics contacts when both objects have a physics body; otherwise compares axis-aligned bounds.',
  },
  {
    opcode: 'sensing_distanceTo',
    category: 'sensing',
    shape: 'reporter',
    targets: OBJECT_ONLY,
    label: 'distance to [TARGET]',
    args: { TARGET: { type: 'dropdown', source: { kind: 'objects' } } },
    tooltip: 'Straight-line distance between the two object origins in world space (metres).',
  },
  {
    opcode: 'sensing_of',
    category: 'sensing',
    shape: 'reporter',
    targets: OBJECT_ONLY,
    label: '[PROPERTY] of [TARGET]',
    args: {
      PROPERTY: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: 'x position', value: 'x' },
            { label: 'y position', value: 'y' },
            { label: 'z position', value: 'z' },
            { label: 'x rotation', value: 'rx' },
            { label: 'y rotation', value: 'ry' },
            { label: 'z rotation', value: 'rz' },
            { label: 'size %', value: 'size' },
          ],
        },
        default: 'y',
      },
      TARGET: { type: 'dropdown', source: { kind: 'objects' } },
    },
    tooltip: 'Reads a property of another object. Positions are world values; rotations are local; size is the uniform scale in %.',
  },
  {
    opcode: 'sensing_timer',
    category: 'sensing',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: 'timer',
    args: {},
    tooltip: 'Seconds of simulated time since the project started running (or was last reset).',
  },
  {
    opcode: 'sensing_resetTimer',
    category: 'sensing',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'reset timer',
    args: {},
    tooltip: 'Sets the timer back to zero.',
  },

  // ---------------------------------------------------------------- Operators
  {
    opcode: 'operator_add',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: '[A] + [B]',
    args: { A: { type: 'number', default: 0 }, B: { type: 'number', default: 0 } },
    tooltip: 'Sum of two numbers.',
  },
  {
    opcode: 'operator_subtract',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: '[A] − [B]',
    args: { A: { type: 'number', default: 0 }, B: { type: 'number', default: 0 } },
    tooltip: 'Difference of two numbers.',
  },
  {
    opcode: 'operator_multiply',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: '[A] × [B]',
    args: { A: { type: 'number', default: 1 }, B: { type: 'number', default: 1 } },
    tooltip: 'Product of two numbers.',
  },
  {
    opcode: 'operator_divide',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: '[A] ÷ [B]',
    args: { A: { type: 'number', default: 1 }, B: { type: 'number', default: 1 } },
    tooltip: 'Quotient. Dividing by zero is reported as an error for the running script.',
  },
  {
    opcode: 'operator_mod',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: '[A] mod [B]',
    args: { A: { type: 'number', default: 10 }, B: { type: 'number', default: 3 } },
    tooltip: 'Remainder with the sign of the dividend (like JavaScript %).',
  },
  {
    opcode: 'operator_round',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: 'round [A]',
    args: { A: { type: 'number', default: 0 } },
    tooltip: 'Rounds to the nearest integer.',
  },
  {
    opcode: 'operator_mathOp',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: '[OP] of [A]',
    args: {
      OP: {
        type: 'dropdown',
        source: {
          kind: 'static',
          options: [
            { label: 'abs', value: 'abs' },
            { label: 'floor', value: 'floor' },
            { label: 'ceiling', value: 'ceiling' },
            { label: 'sqrt', value: 'sqrt' },
            { label: 'sin (deg)', value: 'sin' },
            { label: 'cos (deg)', value: 'cos' },
            { label: 'tan (deg)', value: 'tan' },
          ],
        },
        default: 'abs',
      },
      A: { type: 'number', default: 0 },
    },
    tooltip: 'Common math function. Trigonometric functions take degrees. sqrt of a negative number is an error.',
  },
  {
    opcode: 'operator_random',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: 'pick random [FROM] to [TO]',
    args: { FROM: { type: 'number', default: 1 }, TO: { type: 'number', default: 10 } },
    tooltip: 'Random integer when both ends are integers, otherwise a random decimal between them.',
  },
  {
    opcode: 'operator_lt',
    category: 'operators',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: '[A] < [B]',
    args: { A: { type: 'number', default: 0 }, B: { type: 'number', default: 0 } },
    tooltip: 'True when A is less than B.',
  },
  {
    opcode: 'operator_gt',
    category: 'operators',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: '[A] > [B]',
    args: { A: { type: 'number', default: 0 }, B: { type: 'number', default: 0 } },
    tooltip: 'True when A is greater than B.',
  },
  {
    opcode: 'operator_equals',
    category: 'operators',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: '[A] = [B]',
    args: { A: { type: 'text', default: '' }, B: { type: 'text', default: '' } },
    tooltip: 'True when both values are equal. Numeric text compares as numbers ("2" = 2).',
  },
  {
    opcode: 'operator_and',
    category: 'operators',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: '[A] and [B]',
    args: { A: { type: 'boolean' }, B: { type: 'boolean' } },
    tooltip: 'True when both conditions are true.',
  },
  {
    opcode: 'operator_or',
    category: 'operators',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: '[A] or [B]',
    args: { A: { type: 'boolean' }, B: { type: 'boolean' } },
    tooltip: 'True when at least one condition is true.',
  },
  {
    opcode: 'operator_not',
    category: 'operators',
    shape: 'boolean',
    targets: EVERYWHERE,
    label: 'not [A]',
    args: { A: { type: 'boolean' } },
    tooltip: 'Inverts a condition.',
  },
  {
    opcode: 'operator_join',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: 'join [A] [B]',
    args: { A: { type: 'text', default: 'apple ' }, B: { type: 'text', default: 'banana' } },
    tooltip: 'Concatenates two texts.',
  },
  {
    opcode: 'operator_length',
    category: 'operators',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: 'length of [A]',
    args: { A: { type: 'text', default: 'world' } },
    tooltip: 'Number of characters in the text.',
  },

  // ---------------------------------------------------------------- Variables
  {
    opcode: 'data_variable',
    category: 'variables',
    shape: 'reporter',
    targets: EVERYWHERE,
    label: '[VARIABLE]',
    args: { VARIABLE: { type: 'dropdown', source: { kind: 'variables' } } },
    tooltip: 'Value of a variable visible to this script (global variables and this object\'s own variables).',
  },
  {
    opcode: 'data_setVariable',
    category: 'variables',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'set [VARIABLE] to [VALUE]',
    args: { VARIABLE: { type: 'dropdown', source: { kind: 'variables' } }, VALUE: { type: 'text', default: '0' } },
    tooltip: 'Assigns a value. Numeric text is stored as a number.',
  },
  {
    opcode: 'data_changeVariable',
    category: 'variables',
    shape: 'statement',
    targets: EVERYWHERE,
    label: 'change [VARIABLE] by [VALUE]',
    args: { VARIABLE: { type: 'dropdown', source: { kind: 'variables' } }, VALUE: { type: 'number', default: 1 } },
    tooltip: 'Adds a number to a numeric variable.',
  },

  // ---------------------------------------------------------------- Scene (stage only)
  {
    opcode: 'scene_setGravity',
    category: 'scene',
    shape: 'statement',
    targets: STAGE_ONLY,
    label: 'set gravity x: [X] y: [Y] z: [Z]',
    args: { X: { type: 'number', default: 0 }, Y: { type: 'number', default: -9.81 }, Z: { type: 'number', default: 0 } },
    tooltip: 'Changes the gravity vector (m/s²) for the physics simulation of the running project.',
  },
  {
    opcode: 'scene_setBackground',
    category: 'scene',
    shape: 'statement',
    targets: STAGE_ONLY,
    label: 'set background color to [COLOR]',
    args: { COLOR: { type: 'text', default: '#1d2433' } },
    tooltip: 'Sets the background colour of the stage as a hex string.',
  },
  {
    opcode: 'scene_useCamera',
    category: 'scene',
    shape: 'statement',
    targets: STAGE_ONLY,
    label: 'use camera [CAMERA]',
    args: { CAMERA: { type: 'dropdown', source: { kind: 'cameras' } } },
    tooltip: 'Renders the stage from the chosen Camera object while the project runs.',
  },
  {
    opcode: 'scene_resetCamera',
    category: 'scene',
    shape: 'statement',
    targets: STAGE_ONLY,
    label: 'use stage camera',
    args: {},
    tooltip: 'Renders the stage from the project stage camera settings.',
  },
];

const SPEC_BY_OPCODE = new Map(BLOCK_SPECS.map((s) => [s.opcode, s]));

export function getBlockSpec(opcode: string): BlockSpec | undefined {
  return SPEC_BY_OPCODE.get(opcode);
}

export type TemplatePart = { kind: 'text'; text: string } | { kind: 'arg'; name: string } | { kind: 'stack'; name: string } | { kind: 'newline' };

/** Splits a label into text, argument and stack tokens. Newlines force a line break for C-blocks. */
export function parseTemplate(label: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  const re = /\[([A-Z_]+)\]|\{([A-Z_]+)\}|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(label)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', text: label.slice(last, m.index) });
    if (m[0] === '\n') parts.push({ kind: 'newline' });
    else if (m[1]) parts.push({ kind: 'arg', name: m[1] });
    else if (m[2]) parts.push({ kind: 'stack', name: m[2] });
    last = m.index + m[0].length;
  }
  if (last < label.length) parts.push({ kind: 'text', text: label.slice(last) });
  return parts;
}

/** Validates the catalog's internal consistency. Returns a list of problems (empty when valid). */
export function validateCatalog(specs: readonly BlockSpec[] = BLOCK_SPECS): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of specs) {
    if (seen.has(s.opcode)) problems.push(`duplicate opcode ${s.opcode}`);
    seen.add(s.opcode);
    const placeholders = [...s.label.matchAll(/\[([A-Z_]+)\]|\{([A-Z_]+)\}/g)].map((m) => m[1] ?? m[2]!);
    for (const p of placeholders) if (!s.args[p]) problems.push(`${s.opcode}: placeholder ${p} has no arg spec`);
    for (const [name, arg] of Object.entries(s.args)) {
      if (arg.type === 'stack' && !s.label.includes(`{${name}}`)) problems.push(`${s.opcode}: stack ${name} not in label`);
      if (arg.type !== 'stack' && !s.label.includes(`[${name}]`)) problems.push(`${s.opcode}: arg ${name} not in label`);
    }
    if (s.shape === 'c-block' && !Object.values(s.args).some((a) => a.type === 'stack')) problems.push(`${s.opcode}: c-block without stack`);
    if (s.shape === 'hat' && s.category !== 'events') problems.push(`${s.opcode}: hats belong to events`);
  }
  for (const key of SUPPORTED_KEYS) if (typeof key !== 'string') problems.push('invalid key');
  return problems;
}
