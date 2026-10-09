/**
 * Blockly definitions for every block the runtime implements (see src/runtime/blocks.ts).
 *
 * Each definition is declarative: a message template with `{NAME}` placeholders plus typed
 * arguments. Field and input names MUST match the names the runtime reads (`field(node, 'VAR')`,
 * `num(ctx, node, 'STEPS')`, ...). A unit test checks that every toolbox block is implemented.
 */
import * as Blockly from 'blockly';
import { BLOCK_SPECS, BLOCK_SPEC_BY_TYPE, MATH_OPERATORS, AXIS_CHOICES, SENSING_PROPERTIES, STOP_OPTIONS, type BlockCategory } from '../core/blockTypes';
import { KEY_OPTIONS } from '../core/keys';

/** Dynamic dropdown sources; the editor supplies the current project data through the provider. */
export type OptionSource = 'keys' | 'messages' | 'sounds' | 'variables' | 'objects' | 'anyObject';
export type OptionList = Array<[label: string, value: string]>;
export type OptionProvider = (source: OptionSource) => OptionList;

type ValueKind = 'number' | 'text' | 'color' | 'boolean' | 'any';

type Arg =
  | { kind: 'value'; type: ValueKind; default?: number | string }
  | { kind: 'statement' }
  | { kind: 'dropdown'; options: OptionSource | OptionList };

export interface BlockDef {
  message: string;
  args: Record<string, Arg>;
  /** Passes stored ids through validation so stale references are kept and reported at runtime. */
  keepStaleValues?: boolean;
}

const num = (value: number): Arg => ({ kind: 'value', type: 'number', default: value });
const text = (value: string): Arg => ({ kind: 'value', type: 'text', default: value });
const color = (value: string): Arg => ({ kind: 'value', type: 'color', default: value });
const bool = (): Arg => ({ kind: 'value', type: 'boolean' });
const any = (): Arg => ({ kind: 'value', type: 'any' });
const stmt = (): Arg => ({ kind: 'statement' });
const drop = (options: OptionSource | OptionList): Arg => ({ kind: 'dropdown', options });

const AXIS: OptionList = AXIS_CHOICES.map((a) => [a, a]);
const OPERATORS: OptionList = MATH_OPERATORS.map((o) => [o, o]);
const STOP: OptionList = STOP_OPTIONS.map((o) => [o, o]);
const PROPERTIES: OptionList = SENSING_PROPERTIES.map((p) => [p, p]);
const KEYS: OptionList = KEY_OPTIONS.map(([label, value]) => [label, value]);

export const BLOCK_DEFS: Record<string, BlockDef> = {
  event_whenflagclicked: { message: 'when green flag clicked', args: {} },
  event_whenkeypressed: { message: 'when {KEY} key pressed', args: { KEY: drop(KEYS) } },
  event_whenthisspriteclicked: { message: 'when this object clicked', args: {} },
  event_whenbroadcastreceived: { message: 'when I receive {MESSAGE}', args: { MESSAGE: drop('messages') }, keepStaleValues: true },
  event_broadcast: { message: 'broadcast {MESSAGE}', args: { MESSAGE: drop('messages') }, keepStaleValues: true },
  event_broadcastandwait: { message: 'broadcast {MESSAGE} and wait', args: { MESSAGE: drop('messages') }, keepStaleValues: true },

  motion_moveforward: { message: 'move {STEPS} steps forward', args: { STEPS: num(10) } },
  motion_turnright: { message: 'turn right {DEGREES} degrees', args: { DEGREES: num(15) } },
  motion_turnleft: { message: 'turn left {DEGREES} degrees', args: { DEGREES: num(15) } },
  motion_pointtowards: { message: 'point towards {TARGET}', args: { TARGET: drop('objects') }, keepStaleValues: true },
  motion_setposition: { message: 'set {AXIS} position to {VALUE}', args: { AXIS: drop(AXIS), VALUE: num(0) } },
  motion_changeposition: { message: 'change {AXIS} position by {DELTA}', args: { AXIS: drop(AXIS), DELTA: num(1) } },
  motion_setrotation: { message: 'set {AXIS} rotation to {VALUE}', args: { AXIS: drop(AXIS), VALUE: num(0) } },
  motion_changerotation: { message: 'change {AXIS} rotation by {DELTA}', args: { AXIS: drop(AXIS), DELTA: num(15) } },
  motion_gotoxyz: { message: 'go to x: {X} y: {Y} z: {Z}', args: { X: num(0), Y: num(0.5), Z: num(0) } },
  motion_glide: { message: 'glide {SECS} s to x: {X} y: {Y} z: {Z}', args: { SECS: num(1), X: num(0), Y: num(0.5), Z: num(0) } },
  motion_getposition: { message: '{AXIS} position', args: { AXIS: drop(AXIS) } },
  motion_getrotation: { message: '{AXIS} rotation', args: { AXIS: drop(AXIS) } },

  looks_show: { message: 'show', args: {} },
  looks_hide: { message: 'hide', args: {} },
  looks_say: { message: 'say {TEXT}', args: { TEXT: text('Hello!') } },
  looks_sayfor: { message: 'say {TEXT} for {SECS} seconds', args: { TEXT: text('Hello!'), SECS: num(2) } },
  looks_clearspeech: { message: 'clear speech', args: {} },
  looks_setcolor: { message: 'set color to {COLOR}', args: { COLOR: color('#ff8800') } },
  looks_setopacity: { message: 'set opacity to {VALUE} %', args: { VALUE: num(100) } },
  looks_changeopacity: { message: 'change opacity by {DELTA}', args: { DELTA: num(-10) } },
  looks_setsize: { message: 'set size to {PERCENT} %', args: { PERCENT: num(100) } },
  looks_changesize: { message: 'change size by {DELTA}', args: { DELTA: num(10) } },
  looks_size: { message: 'size', args: {} },
  looks_isvisible: { message: 'visible?', args: {} },

  sound_play: { message: 'play sound {SOUND}', args: { SOUND: drop('sounds') }, keepStaleValues: true },
  sound_playuntildone: { message: 'play sound {SOUND} until done', args: { SOUND: drop('sounds') }, keepStaleValues: true },
  sound_stop: { message: 'stop sound {SOUND}', args: { SOUND: drop('sounds') }, keepStaleValues: true },
  sound_stopall: { message: 'stop all sounds', args: {} },
  sound_setvolume: { message: 'set volume to {VOLUME} %', args: { VOLUME: num(100) } },
  sound_changevolume: { message: 'change volume by {DELTA}', args: { DELTA: num(-10) } },
  sound_volume: { message: 'volume', args: {} },

  control_wait: { message: 'wait {SECS} seconds', args: { SECS: num(1) } },
  control_repeat: { message: 'repeat {TIMES} {SUBSTACK}', args: { TIMES: num(10), SUBSTACK: stmt() } },
  control_forever: { message: 'forever {SUBSTACK}', args: { SUBSTACK: stmt() } },
  control_if: { message: 'if {CONDITION} then {SUBSTACK}', args: { CONDITION: bool(), SUBSTACK: stmt() } },
  control_if_else: { message: 'if {CONDITION} then {SUBSTACK} else {SUBSTACK2}', args: { CONDITION: bool(), SUBSTACK: stmt(), SUBSTACK2: stmt() } },
  control_wait_until: { message: 'wait until {CONDITION}', args: { CONDITION: bool() } },
  control_repeat_until: { message: 'repeat until {CONDITION} {SUBSTACK}', args: { CONDITION: bool(), SUBSTACK: stmt() } },
  control_stop: { message: 'stop {OPTION}', args: { OPTION: drop(STOP) } },

  sensing_keypressed: { message: 'key {KEY} pressed?', args: { KEY: drop(KEYS) } },
  sensing_mousedown: { message: 'mouse down?', args: {} },
  sensing_touching: { message: 'touching {OBJECT}?', args: { OBJECT: drop('anyObject') }, keepStaleValues: true },
  sensing_distanceto: { message: 'distance to {OBJECT}', args: { OBJECT: drop('objects') }, keepStaleValues: true },
  sensing_of: { message: '{PROPERTY} of {OBJECT}', args: { PROPERTY: drop(PROPERTIES), OBJECT: drop('objects') }, keepStaleValues: true },
  sensing_timer: { message: 'timer', args: {} },
  sensing_resettimer: { message: 'reset timer', args: {} },

  operator_add: { message: '{NUM1} + {NUM2}', args: { NUM1: num(0), NUM2: num(0) } },
  operator_subtract: { message: '{NUM1} - {NUM2}', args: { NUM1: num(0), NUM2: num(0) } },
  operator_multiply: { message: '{NUM1} * {NUM2}', args: { NUM1: num(0), NUM2: num(0) } },
  operator_divide: { message: '{NUM1} / {NUM2}', args: { NUM1: num(0), NUM2: num(1) } },
  operator_mod: { message: '{NUM1} mod {NUM2}', args: { NUM1: num(0), NUM2: num(1) } },
  operator_round: { message: 'round {NUM}', args: { NUM: num(0) } },
  operator_mathop: { message: '{OPERATOR} of {NUM}', args: { OPERATOR: drop(OPERATORS), NUM: num(0) } },
  operator_random: { message: 'pick random {FROM} to {TO}', args: { FROM: num(1), TO: num(10) } },
  operator_lt: { message: '{OPERAND1} < {OPERAND2}', args: { OPERAND1: any(), OPERAND2: any() } },
  operator_equals: { message: '{OPERAND1} = {OPERAND2}', args: { OPERAND1: any(), OPERAND2: any() } },
  operator_gt: { message: '{OPERAND1} > {OPERAND2}', args: { OPERAND1: any(), OPERAND2: any() } },
  operator_and: { message: '{OPERAND1} and {OPERAND2}', args: { OPERAND1: bool(), OPERAND2: bool() } },
  operator_or: { message: '{OPERAND1} or {OPERAND2}', args: { OPERAND1: bool(), OPERAND2: bool() } },
  operator_not: { message: 'not {OPERAND}', args: { OPERAND: bool() } },
  operator_join: { message: 'join {STRING1} {STRING2}', args: { STRING1: text('apple'), STRING2: text('banana') } },
  operator_length: { message: 'length of {STRING}', args: { STRING: text('apple') } },

  data_variable: { message: '{VAR}', args: { VAR: drop('variables') }, keepStaleValues: true },
  data_setvariableto: { message: 'set {VAR} to {VALUE}', args: { VAR: drop('variables'), VALUE: text('0') }, keepStaleValues: true },
  data_changevariableby: { message: 'change {VAR} by {VALUE}', args: { VAR: drop('variables'), VALUE: num(1) }, keepStaleValues: true },

  physics_impulse: { message: 'apply impulse x: {X} y: {Y} z: {Z}', args: { X: num(0), Y: num(5), Z: num(0) } },
  physics_setvelocity: { message: 'set velocity x: {X} y: {Y} z: {Z}', args: { X: num(0), Y: num(0), Z: num(0) } },
  physics_getvelocity: { message: '{AXIS} velocity', args: { AXIS: drop(AXIS) } },
  physics_setgravity: { message: 'set gravity x: {X} y: {Y} z: {Z}', args: { X: num(0), Y: num(-9.81), Z: num(0) } },

};

/** Field names of the literal shadow blocks (they carry a single field, not an input). */
/** Colour literals are hex text (Blockly core has no colour field); the runtime validates them too. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const LITERAL_FIELD: Record<string, string> = { bite_number: 'NUM', bite_text: 'TEXT', bite_color: 'COLOUR' };
const LITERAL_CHECK: Record<string, string | null> = { bite_number: 'Number', bite_text: 'String', bite_color: 'String' };

const CATEGORY_COLOUR: Record<BlockCategory, string> = {
  events: '#ffbf00',
  motion: '#4c97ff',
  looks: '#9966ff',
  sound: '#cf63cf',
  control: '#ffab19',
  sensing: '#5cb1d6',
  operators: '#59c059',
  variables: '#ff8c1a',
  physics: '#2bb8a7',
  internal: '#8a94a6',
};

export const CATEGORY_LABEL: Record<Exclude<BlockCategory, 'internal'>, string> = {
  events: 'Events',
  motion: 'Motion',
  looks: 'Looks',
  sound: 'Sound',
  control: 'Control',
  sensing: 'Sensing',
  operators: 'Operators',
  variables: 'Variables',
  physics: 'Physics',
};

let optionProvider: OptionProvider = () => [['(none)', '']];

/** The editor installs the provider that reads the current project (variables, objects, ...). */
export function setOptionProvider(provider: OptionProvider): void {
  optionProvider = provider;
}

function optionsFor(arg: Arg & { kind: 'dropdown' }): () => OptionList {
  return () => {
    const list = typeof arg.options === 'string' ? optionProvider(arg.options) : arg.options;
    return list.length > 0 ? list : [['(none)', '']];
  };
}

/** Splits a message into literal text and placeholder names. */
export function parseMessage(message: string): Array<{ text: string } | { name: string }> {
  const parts: Array<{ text: string } | { name: string }> = [];
  const re = /\{([A-Z0-9_]+)\}/g;
  let last = 0;
  for (let m = re.exec(message); m; m = re.exec(message)) {
    if (m.index > last) parts.push({ text: message.slice(last, m.index) });
    parts.push({ name: m[1] });
    last = m.index + m[0].length;
  }
  if (last < message.length) parts.push({ text: message.slice(last) });
  return parts;
}

function outputCheck(shape: string): string | null | undefined {
  if (shape === 'number') return 'Number';
  if (shape === 'text') return 'String';
  if (shape === 'boolean') return 'Boolean';
  if (shape === 'any' || shape === 'value') return null;
  return undefined;
}

const CHECK_FOR: Record<ValueKind, string | null> = { number: null, text: null, color: null, boolean: 'Boolean', any: null };

function literalBlock(type: string): void {
  const fieldName = LITERAL_FIELD[type];
  const check = LITERAL_CHECK[type];
  const block = {
    init(this: Blockly.Block) {
      const field =
        fieldName === 'NUM'
          ? new Blockly.FieldNumber(0)
          : fieldName === 'COLOUR'
            ? new Blockly.FieldTextInput('#ff8800', (value: string) => (HEX_COLOR.test(value.trim()) ? value.trim().toLowerCase() : null))
            : new Blockly.FieldTextInput('');
      this.appendDummyInput().appendField(field, fieldName);
      this.setOutput(true, check);
      this.setColour(CATEGORY_COLOUR.internal);
    },
  };
  Blockly.common.defineBlocks({ [type]: block });
}

function defineStandardBlock(type: string, def: BlockDef): void {
  const spec = BLOCK_SPEC_BY_TYPE.get(type);
  if (!spec) throw new Error(`Block ${type} has no specification.`);
  const parts = parseMessage(def.message);
  const colour = CATEGORY_COLOUR[spec.category];
  const init = function (this: Blockly.Block) {
    this.setColour(colour);
    this.setInputsInline(true);
    let pending: Blockly.Input | null = null;
    const ensure = (): Blockly.Input => {
      if (!pending) pending = this.appendDummyInput();
      return pending;
    };
    for (const part of parts) {
      if ('text' in part) {
        ensure().appendField(part.text);
        continue;
      }
      const arg = def.args[part.name];
      if (!arg) throw new Error(`Block ${type} has no argument ${part.name}.`);
      if (arg.kind === 'dropdown') {
        const dropdown = def.keepStaleValues
          ? new KeepStaleDropdown(optionsFor(arg) as never)
          : new Blockly.FieldDropdown(optionsFor(arg) as never);
        ensure().appendField(dropdown, part.name);
      } else if (arg.kind === 'value') {
        this.appendValueInput(part.name).setCheck(CHECK_FOR[arg.type]);
        pending = null;
      } else {
        this.appendStatementInput(part.name);
        pending = null;
      }
    }
    if (spec.shape === 'hat') {
      this.setPreviousStatement(false);
      this.setNextStatement(true);
    } else if (spec.shape === 'cap') {
      this.setPreviousStatement(true);
      this.setNextStatement(false);
    } else if (spec.shape === 'stack' || spec.shape === 'c') {
      this.setPreviousStatement(true);
      this.setNextStatement(true);
    } else {
      this.setOutput(true, outputCheck(spec.shape) ?? null);
    }
  };
  Blockly.common.defineBlocks({ [type]: { init } });
}

let defined = false;

/** Registers every block definition with Blockly. Safe to call more than once. */
/**
 * Dropdown that keeps a value even when it is not in the current option list (for example a sound that
 * was deleted). Blockly would otherwise silently replace it with the first option when the script loads.
 */
class KeepStaleDropdown extends Blockly.FieldDropdown {
  protected override doClassValidation_(newValue?: string): string | null {
    return newValue ?? null;
  }
}

export function defineBiteBlocks(): void {
  if (defined) return;
  defined = true;
  for (const spec of BLOCK_SPECS) {
    if (spec.category === 'internal') {
      literalBlock(spec.type);
      continue;
    }
    const def = BLOCK_DEFS[spec.type];
    if (!def) throw new Error(`No Blockly definition for ${spec.type}.`);
    defineStandardBlock(spec.type, def);
  }
}

/** Default shadow literal for a value argument (the toolbox places these, so new blocks have values). */
function shadowFor(arg: Arg): Record<string, unknown> | null {
  if (arg.kind !== 'value' || arg.default === undefined) return null;
  if (arg.type === 'number') return { type: 'bite_number', fields: { NUM: arg.default } };
  if (arg.type === 'text') return { type: 'bite_text', fields: { TEXT: arg.default } };
  if (arg.type === 'color') return { type: 'bite_color', fields: { COLOUR: arg.default } };
  return null;
}

export interface ToolboxBlock {
  kind: 'block';
  type: string;
  inputs?: Record<string, { shadow: Record<string, unknown> }>;
  fields?: Record<string, string>;
}

export interface ToolboxCategory {
  kind: 'category';
  name: string;
  colour: string;
  contents: Array<ToolboxBlock | { kind: 'button'; text: string; callbackKey: string } | { kind: 'label'; text: string }>;
}

/** The toolbox layout. Grouped by category, same order as the Scratch editor. */
export function buildToolbox(): { kind: 'categoryToolbox'; contents: ToolboxCategory[] } {
  const order: Array<Exclude<BlockCategory, 'internal'>> = ['events', 'motion', 'looks', 'sound', 'control', 'sensing', 'operators', 'variables', 'physics'];
  const contents: ToolboxCategory[] = order.map((category) => {
    const blocks: ToolboxCategory['contents'] = [];
    if (category === 'variables') blocks.push({ kind: 'button', text: 'Make a variable', callbackKey: 'BITE_NEW_VARIABLE' });
    if (category === 'events') blocks.push({ kind: 'button', text: 'Make a message', callbackKey: 'BITE_NEW_MESSAGE' });
    for (const spec of BLOCK_SPECS) {
      if (spec.category !== category) continue;
      const def = BLOCK_DEFS[spec.type];
      const block: ToolboxBlock = { kind: 'block', type: spec.type };
      const inputs: Record<string, { shadow: Record<string, unknown> }> = {};
      for (const [name, arg] of Object.entries(def.args)) {
        const shadow = shadowFor(arg);
        if (shadow) inputs[name] = { shadow };
      }
      if (Object.keys(inputs).length > 0) block.inputs = inputs;
      blocks.push(block);
    }
    return { kind: 'category', name: CATEGORY_LABEL[category], colour: CATEGORY_COLOUR[category], contents: blocks };
  });
  return { kind: 'categoryToolbox', contents };
}

/** Block types that appear in the toolbox (what users can drag). */
export function toolboxBlockTypes(): string[] {
  return BLOCK_SPECS.filter((s) => s.category !== 'internal').map((s) => s.type);
}

export const BITE_THEME_NAME = 'bite-light';
