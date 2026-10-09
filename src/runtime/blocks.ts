/* eslint-disable require-yield -- Statement blocks are generator functions so the scheduler runs every block the same way (a block yields to end its frame). Many blocks finish in one step and do not yield; that is intended. */
/**
 * Block implementations: one entry per block type in core/blockTypes.ts.
 *
 * Execution model (see DESIGN_LOG.md, D-09): a script is a generator. Statements run
 * synchronously until they need to wait; every loop iteration and every wait yields once
 * per logic tick, so an infinite loop cannot freeze the page and Stop takes effect at the
 * next tick. Reporters are pure synchronous functions.
 */
import { wrapDegrees, clamp, forwardFromRotation, sizePercent, yawToward, distance, AXIS_INDEX, type Axis } from '../core/math';
import { ANY_OBJECT_ID, type Vec3 } from '../core/types';
import { MATH_OPERATORS } from '../core/blockTypes';
import type { ScriptNode } from '../core/scripts';
import { ANY_KEY } from '../core/keys';
import { compareValues, equalsValues, randomBetween, toBoolean, toNumber, toText, type BiteValue } from './values';
import type { LiveTarget } from './sceneState';
import type { RuntimeCore, Thread } from './types';

/** A user-facing failure that stops the current script (the message is shown in the Output panel). */
export class ScriptError extends Error {
  /** Id of the innermost block that raised the error (set by executeStatement). */
  blockId?: string;
  constructor(message: string) {
    super(message);
    this.name = 'ScriptError';
  }
}

/** Control signal used to unwind a thread for "stop this script" / "stop all". Not an error. */
export class ThreadStop extends Error {
  constructor() {
    super('thread stopped');
    this.name = 'ThreadStop';
  }
}

type Gen = Generator<void, void, unknown>;

export interface ExecContext {
  core: RuntimeCore;
  /** The object running the script, or null for Stage scripts. */
  target: LiveTarget | null;
  thread: Thread;
}

type StatementFn = (ctx: ExecContext, node: ScriptNode) => Gen;
type ReporterFn = (ctx: ExecContext, node: ScriptNode) => unknown;

const statements: Record<string, StatementFn> = {};
const reporters: Record<string, ReporterFn> = {};

// ------------------------------------------------------------------ helpers

function field(node: ScriptNode, name: string): string {
  const value = node.fields[name];
  return value === undefined || value === null ? '' : String(value);
}

function input(ctx: ExecContext, node: ScriptNode, name: string, fallback: unknown): unknown {
  const child = node.inputs[name];
  return child ? evaluate(ctx, child) : fallback;
}

function num(ctx: ExecContext, node: ScriptNode, name: string, fallback = 0): number {
  return toNumber(input(ctx, node, name, fallback));
}

function bool(ctx: ExecContext, node: ScriptNode, name: string): boolean {
  return toBoolean(input(ctx, node, name, false));
}

function text(ctx: ExecContext, node: ScriptNode, name: string): string {
  return toText(input(ctx, node, name, ''));
}

function needObject(ctx: ExecContext, blockLabel: string): LiveTarget {
  if (!ctx.target) throw new ScriptError(`"${blockLabel}" needs an object. The Stage cannot be moved or styled.`);
  return ctx.target;
}

function axisOf(node: ScriptNode): Axis {
  const raw = field(node, 'AXIS').toLowerCase();
  if (raw === 'x' || raw === 'y' || raw === 'z') return raw;
  throw new ScriptError(`Choose an axis (X, Y or Z) in "${node.type}".`);
}

function resolveObject(ctx: ExecContext, objectId: string, allowAny: boolean): LiveTarget | null {
  if (objectId === ANY_OBJECT_ID) {
    if (allowAny) return null;
    throw new ScriptError('Choose an object in this block.');
  }
  if (!objectId) throw new ScriptError('Choose an object in this block.');
  const target = ctx.core.scene.get(objectId);
  if (!target) {
    const name = ctx.core.model.objects.get(objectId)?.name;
    throw new ScriptError(name ? `The object "${name}" no longer exists.` : 'The chosen object no longer exists.');
  }
  return target;
}

function requirePhysics(ctx: ExecContext): NonNullable<RuntimeCore['physics']> {
  const physics = ctx.core.physics;
  if (!physics) throw new ScriptError('Physics is not running. Press Run to use physics blocks.');
  return physics;
}

function warnOnce(ctx: ExecContext, key: string, message: string, blockId?: string): void {
  if (ctx.thread.reported.has(key)) return;
  ctx.thread.reported.add(key);
  ctx.core.log('warn', message, ctx.thread, blockId);
}

function variableOf(node: ScriptNode): string {
  const id = field(node, 'VAR');
  if (!id) throw new ScriptError('Choose a variable in this block.');
  return id;
}

function readVar(ctx: ExecContext, node: ScriptNode): BiteValue {
  return ctx.core.readVariable(variableOf(node), ctx.target) as BiteValue;
}

function hexColor(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  throw new ScriptError(`"${value}" is not a color. Use a color picker value such as #ff8800.`);
}

function vectorFrom(ctx: ExecContext, node: ScriptNode, names: [string, string, string]): Vec3 {
  return [num(ctx, node, names[0]), num(ctx, node, names[1]), num(ctx, node, names[2])];
}

function waitSeconds(ctx: ExecContext, seconds: number): Gen {
  return (function* waitGen(): Gen {
    const end = ctx.core.time + Math.max(0, seconds);
    do {
      yield;
    } while (ctx.core.time < end);
  })();
}

// ------------------------------------------------------------- evaluation

export function evaluate(ctx: ExecContext, node: ScriptNode): unknown {
  switch (node.type) {
    case 'bite_number':
      return toNumber(node.fields.NUM);
    case 'bite_text':
      return toText(node.fields.TEXT);
    case 'bite_color':
      return toText(node.fields.COLOUR);
    default:
      break;
  }
  const fn = reporters[node.type];
  if (!fn) {
    if (statements[node.type]) throw new ScriptError(`"${node.type}" is a command block and cannot be used as a value.`);
    throw new ScriptError(`Block "${node.type}" is not supported by this version of Bite.`);
  }
  return fn(ctx, node);
}

/** Runs a chain of statements (a stack) starting at `first`. */
export function* runChain(ctx: ExecContext, first: ScriptNode | undefined): Gen {
  let node = first;
  while (node) {
    yield* executeStatement(ctx, node);
    node = node.next;
  }
}

export function* executeStatement(ctx: ExecContext, node: ScriptNode): Gen {
  const fn = statements[node.type];
  if (!fn) {
    if (reporters[node.type] || node.type.startsWith('bite_')) {
      throw new ScriptError(`"${node.type}" is a value block and cannot be run on its own. Attach it to a command block.`);
    }
    throw new ScriptError(`Block "${node.type}" is not supported by this version of Bite.`);
  }
  try {
    yield* fn(ctx, node);
  } catch (error) {
    // The innermost block sets the id first, so the message points at the block that failed.
    if (error instanceof ScriptError && error.blockId === undefined) error.blockId = node.id;
    throw error;
  }
}

// --------------------------------------------------------- statement blocks

// Events: hats do nothing when executed; their stack is run by the runtime.
for (const hat of ['event_whenflagclicked', 'event_whenkeypressed', 'event_whenthisspriteclicked', 'event_whenbroadcastreceived']) {
  statements[hat] = function* hatNoop(): Gen {
    return;
  };
}

statements.event_broadcast = function* broadcast(ctx, node): Gen {
  const message = field(node, 'MESSAGE');
  if (!message) throw new ScriptError('Choose a message to broadcast.');
  if (!ctx.core.model.messages.has(message)) throw new ScriptError('The message no longer exists.');
  ctx.core.broadcast(message);
};

statements.event_broadcastandwait = function* broadcastAndWait(ctx, node): Gen {
  const message = field(node, 'MESSAGE');
  if (!message) throw new ScriptError('Choose a message to broadcast.');
  if (!ctx.core.model.messages.has(message)) throw new ScriptError('The message no longer exists.');
  const started = ctx.core.broadcast(message);
  while (started.some((t) => !t.done)) yield;
};

// Motion (3D). Positions are local to the parent; for top-level objects this is the world position.
statements.motion_moveforward = function* moveForward(ctx, node): Gen {
  const target = needObject(ctx, 'move forward');
  const steps = num(ctx, node, 'STEPS', 10);
  const f = forwardFromRotation(target.rotation);
  const p = target.position;
  ctx.core.scene.setPose(target.id, { position: [p[0] + f[0] * steps, p[1] + f[1] * steps, p[2] + f[2] * steps] });
};

function turn(ctx: ExecContext, node: ScriptNode, sign: 1 | -1, label: string): void {
  const target = needObject(ctx, label);
  const degrees = num(ctx, node, 'DEGREES', 15);
  const r = target.rotation;
  ctx.core.scene.setPose(target.id, { rotation: [r[0], wrapDegrees(r[1] + sign * degrees), r[2]] });
}

statements.motion_turnright = function* turnRight(ctx, node): Gen {
  // Clockwise when viewed from above = decreasing yaw.
  turn(ctx, node, -1, 'turn right');
};
statements.motion_turnleft = function* turnLeft(ctx, node): Gen {
  turn(ctx, node, 1, 'turn left');
};

statements.motion_pointtowards = function* pointTowards(ctx, node): Gen {
  const target = needObject(ctx, 'point towards');
  const other = resolveObject(ctx, field(node, 'TARGET'), false) as LiveTarget;
  if (other.id === target.id) throw new ScriptError('An object cannot point toward itself.');
  const me = ctx.core.scene.worldPosition(target.id);
  const them = ctx.core.scene.worldPosition(other.id);
  const worldYaw = yawToward(them[0] - me[0], them[2] - me[2]);
  const parent = target.parentId ? ctx.core.scene.get(target.parentId) : undefined;
  const parentYaw = parent ? parent.rotation[1] : 0;
  const r = target.rotation;
  ctx.core.scene.setPose(target.id, { rotation: [r[0], wrapDegrees(worldYaw - parentYaw), r[2]] });
};

statements.motion_setposition = function* setPosition(ctx, node): Gen {
  const target = needObject(ctx, 'set position');
  const axis = AXIS_INDEX[axisOf(node)];
  const value = num(ctx, node, 'VALUE');
  const p = [...target.position] as Vec3;
  p[axis] = value;
  ctx.core.scene.setPose(target.id, { position: p });
};

statements.motion_changeposition = function* changePosition(ctx, node): Gen {
  const target = needObject(ctx, 'change position');
  const axis = AXIS_INDEX[axisOf(node)];
  const delta = num(ctx, node, 'DELTA');
  const p = [...target.position] as Vec3;
  p[axis] += delta;
  ctx.core.scene.setPose(target.id, { position: p });
};

statements.motion_setrotation = function* setRotation(ctx, node): Gen {
  const target = needObject(ctx, 'set rotation');
  const axis = AXIS_INDEX[axisOf(node)];
  const value = num(ctx, node, 'VALUE');
  const r = [...target.rotation] as Vec3;
  r[axis] = value;
  ctx.core.scene.setPose(target.id, { rotation: r });
};

statements.motion_changerotation = function* changeRotation(ctx, node): Gen {
  const target = needObject(ctx, 'change rotation');
  const axis = AXIS_INDEX[axisOf(node)];
  const delta = num(ctx, node, 'DELTA');
  const r = [...target.rotation] as Vec3;
  r[axis] += delta;
  ctx.core.scene.setPose(target.id, { rotation: r });
};

statements.motion_gotoxyz = function* gotoXYZ(ctx, node): Gen {
  const target = needObject(ctx, 'go to x y z');
  ctx.core.scene.setPose(target.id, { position: vectorFrom(ctx, node, ['X', 'Y', 'Z']) });
};

statements.motion_glide = function* glide(ctx, node): Gen {
  const target = needObject(ctx, 'glide');
  const seconds = Math.max(0, num(ctx, node, 'SECS', 1));
  const to = vectorFrom(ctx, node, ['X', 'Y', 'Z']);
  const from = [...target.position] as Vec3;
  const start = ctx.core.time;
  if (seconds === 0) {
    ctx.core.scene.setPose(target.id, { position: to });
    return;
  }
  for (;;) {
    const f = Math.min(1, (ctx.core.time - start) / seconds);
    ctx.core.scene.setPose(target.id, {
      position: [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, from[2] + (to[2] - from[2]) * f],
    });
    if (f >= 1) return;
    yield;
  }
};

// Looks and appearance
statements.looks_show = function* show(ctx): Gen {
  const target = needObject(ctx, 'show');
  target.visible = true;
};
statements.looks_hide = function* hide(ctx): Gen {
  const target = needObject(ctx, 'hide');
  target.visible = false;
};
statements.looks_say = function* say(ctx, node): Gen {
  const target = needObject(ctx, 'say');
  target.speech = { text: text(ctx, node, 'TEXT'), until: null };
};
statements.looks_sayfor = function* sayFor(ctx, node): Gen {
  const target = needObject(ctx, 'say for');
  const seconds = Math.max(0, num(ctx, node, 'SECS', 2));
  target.speech = { text: text(ctx, node, 'TEXT'), until: ctx.core.time + seconds };
  yield* waitSeconds(ctx, seconds);
};
statements.looks_clearspeech = function* clearSpeech(ctx): Gen {
  const target = needObject(ctx, 'clear speech');
  target.speech = null;
};
statements.looks_setcolor = function* setColor(ctx, node): Gen {
  const target = needObject(ctx, 'set color');
  target.color = hexColor(text(ctx, node, 'COLOR'));
};
statements.looks_setopacity = function* setOpacity(ctx, node): Gen {
  const target = needObject(ctx, 'set opacity');
  target.opacity = clamp(num(ctx, node, 'VALUE', 100) / 100, 0, 1);
};
statements.looks_changeopacity = function* changeOpacity(ctx, node): Gen {
  const target = needObject(ctx, 'change opacity');
  target.opacity = clamp(target.opacity + num(ctx, node, 'DELTA', -10) / 100, 0, 1);
};

function setSizePercent(ctx: ExecContext, target: LiveTarget, percent: number): void {
  const current = sizePercent(target.scale);
  const next = Math.max(percent, 0.0001);
  // Keep the proportions of a non-uniformly scaled object; a zero-size object gets uniform scale.
  const factor = current > 1e-9 ? next / current : 0;
  const scale: Vec3 =
    current > 1e-9
      ? [target.scale[0] * factor, target.scale[1] * factor, target.scale[2] * factor]
      : [next / 100, next / 100, next / 100];
  ctx.core.scene.setPose(target.id, { scale });
}

statements.looks_setsize = function* setSize(ctx, node): Gen {
  const target = needObject(ctx, 'set size');
  setSizePercent(ctx, target, num(ctx, node, 'PERCENT', 100));
};
statements.looks_changesize = function* changeSize(ctx, node): Gen {
  const target = needObject(ctx, 'change size');
  setSizePercent(ctx, target, sizePercent(target.scale) + num(ctx, node, 'DELTA', 10));
};

// Sound
function soundId(ctx: ExecContext, node: ScriptNode): string {
  const id = field(node, 'SOUND');
  if (!id) throw new ScriptError('Choose a sound in this block. Add sounds in the Assets panel.');
  if (!ctx.core.audio.hasSound(id)) {
    const name = ctx.core.model.sounds.get(id)?.name;
    throw new ScriptError(name ? `The sound "${name}" is not available.` : 'The chosen sound no longer exists.');
  }
  return id;
}

function playSound(ctx: ExecContext, node: ScriptNode): ReturnType<RuntimeCore['audio']['play']> {
  const id = soundId(ctx, node);
  const volume = ctx.target ? ctx.target.soundVolume : ctx.core.stageVolume;
  try {
    return ctx.core.audio.play(id, ctx.target?.id ?? null, volume);
  } catch (error) {
    throw new ScriptError(`Could not play the sound: ${error instanceof Error ? error.message : String(error)}`);
  }
}

statements.sound_play = function* playSoundBlock(ctx, node): Gen {
  playSound(ctx, node);
};
statements.sound_playuntildone = function* playUntilDone(ctx, node): Gen {
  const handle = playSound(ctx, node);
  while (!handle.done) yield;
};
statements.sound_stop = function* stopSound(ctx, node): Gen {
  ctx.core.audio.stopSound(soundId(ctx, node));
};
statements.sound_stopall = function* stopAllSounds(ctx): Gen {
  ctx.core.audio.stopAll();
};
function setVolume(ctx: ExecContext, percent: number): void {
  const v = clamp(percent, 0, 100);
  if (ctx.target) {
    ctx.target.soundVolume = v;
    ctx.core.audio.setTargetVolume(ctx.target.id, v);
  } else {
    ctx.core.stageVolume = v;
  }
}
statements.sound_setvolume = function* setSoundVolume(ctx, node): Gen {
  setVolume(ctx, num(ctx, node, 'VOLUME', 100));
};
statements.sound_changevolume = function* changeSoundVolume(ctx, node): Gen {
  const current = ctx.target ? ctx.target.soundVolume : ctx.core.stageVolume;
  setVolume(ctx, current + num(ctx, node, 'DELTA', -10));
};

// Control
statements.control_wait = function* wait(ctx, node): Gen {
  yield* waitSeconds(ctx, num(ctx, node, 'SECS', 1));
};
statements.control_repeat = function* repeat(ctx, node): Gen {
  const times = Math.floor(num(ctx, node, 'TIMES', 10));
  for (let i = 0; i < times; i += 1) {
    yield* runChain(ctx, node.inputs.SUBSTACK);
    yield;
  }
};
statements.control_forever = function* forever(ctx, node): Gen {
  for (;;) {
    yield* runChain(ctx, node.inputs.SUBSTACK);
    yield;
  }
};
statements.control_if = function* ifBlock(ctx, node): Gen {
  if (bool(ctx, node, 'CONDITION')) yield* runChain(ctx, node.inputs.SUBSTACK);
};
statements.control_if_else = function* ifElse(ctx, node): Gen {
  if (bool(ctx, node, 'CONDITION')) yield* runChain(ctx, node.inputs.SUBSTACK);
  else yield* runChain(ctx, node.inputs.SUBSTACK2);
};
statements.control_wait_until = function* waitUntil(ctx, node): Gen {
  while (!bool(ctx, node, 'CONDITION')) yield;
};
statements.control_repeat_until = function* repeatUntil(ctx, node): Gen {
  while (!bool(ctx, node, 'CONDITION')) {
    yield* runChain(ctx, node.inputs.SUBSTACK);
    yield;
  }
};
statements.control_stop = function* stop(ctx, node): Gen {
  const option = field(node, 'OPTION');
  if (option === 'all') {
    ctx.core.stopAll(ctx.thread);
    throw new ThreadStop();
  }
  if (option === 'other scripts in object') {
    ctx.core.stopOtherThreadsOf(ctx.target?.id ?? null, ctx.thread);
    return;
  }
  throw new ThreadStop();
};

// Variables
statements.data_setvariableto = function* setVariable(ctx, node): Gen {
  const id = variableOf(node);
  ctx.core.writeVariable(id, ctx.target, input(ctx, node, 'VALUE', '') as BiteValue);
};
statements.data_changevariableby = function* changeVariable(ctx, node): Gen {
  const id = variableOf(node);
  const current = toNumber(ctx.core.readVariable(id, ctx.target));
  ctx.core.writeVariable(id, ctx.target, current + num(ctx, node, 'VALUE', 1));
};

// Physics
statements.physics_impulse = function* impulse(ctx, node): Gen {
  const target = needObject(ctx, 'apply impulse');
  const physics = requirePhysics(ctx);
  const v = vectorFrom(ctx, node, ['X', 'Y', 'Z']);
  if (!physics.applyImpulse(target.id, v)) {
    warnOnce(ctx, 'impulse-nobody', `"${target.name}" has no dynamic physics body, so the impulse was ignored. Set its Physics mode to Dynamic in the Inspector.`, node.id);
  }
};
statements.physics_setvelocity = function* setVelocity(ctx, node): Gen {
  const target = needObject(ctx, 'set velocity');
  const physics = requirePhysics(ctx);
  const v = vectorFrom(ctx, node, ['X', 'Y', 'Z']);
  if (!physics.setVelocity(target.id, v)) {
    warnOnce(ctx, 'velocity-nobody', `"${target.name}" has no dynamic physics body, so its velocity was not set. Set its Physics mode to Dynamic in the Inspector.`, node.id);
  }
};
statements.physics_setgravity = function* setGravity(ctx, node): Gen {
  const physics = requirePhysics(ctx);
  physics.setGravity(vectorFrom(ctx, node, ['X', 'Y', 'Z']));
};

// ------------------------------------------------------------- reporters

reporters.bite_number = (_ctx, node) => toNumber(node.fields.NUM);

reporters.motion_getposition = (ctx, node) => {
  const target = needObject(ctx, 'position');
  return target.position[AXIS_INDEX[axisOf(node)]];
};
reporters.motion_getrotation = (ctx, node) => {
  const target = needObject(ctx, 'rotation');
  return target.rotation[AXIS_INDEX[axisOf(node)]];
};

reporters.looks_size = (ctx) => sizePercent(needObject(ctx, 'size').scale);
reporters.looks_isvisible = (ctx) => needObject(ctx, 'visible').visible;
reporters.sound_volume = (ctx) => (ctx.target ? ctx.target.soundVolume : ctx.core.stageVolume);

reporters.sensing_keypressed = (ctx, node) => {
  const key = field(node, 'KEY');
  if (!key) throw new ScriptError('Choose a key in this block.');
  return key === ANY_KEY ? ctx.core.keys.size > 0 : ctx.core.keys.has(key);
};
reporters.sensing_mousedown = (ctx) => ctx.core.mouseDown;
reporters.sensing_timer = (ctx) => ctx.core.timer;
reporters.sensing_touching = (ctx, node) => {
  const self = needObject(ctx, 'touching');
  const physics = requirePhysics(ctx);
  const other = resolveObject(ctx, field(node, 'OBJECT'), true);
  if (!other) return physics.touchingAny(self.id);
  return physics.touching(self.id, other.id);
};
reporters.sensing_distanceto = (ctx, node) => {
  const self = needObject(ctx, 'distance to');
  const other = resolveObject(ctx, field(node, 'OBJECT'), false) as LiveTarget;
  return distance(ctx.core.scene.worldPosition(self.id), ctx.core.scene.worldPosition(other.id));
};
reporters.sensing_of = (ctx, node) => {
  const other = resolveObject(ctx, field(node, 'OBJECT'), false) as LiveTarget;
  const property = field(node, 'PROPERTY');
  switch (property) {
    case 'x position':
      return other.position[0];
    case 'y position':
      return other.position[1];
    case 'z position':
      return other.position[2];
    case 'x rotation':
      return other.rotation[0];
    case 'y rotation':
      return other.rotation[1];
    case 'z rotation':
      return other.rotation[2];
    case 'size':
      return sizePercent(other.scale);
    case 'visible':
      return other.visible;
    default:
      throw new ScriptError(`Choose a property to read in "of" (got "${property}").`);
  }
};
statements.sensing_resettimer = function* resetTimer(ctx): Gen {
  ctx.core.resetTimer();
};

reporters.physics_getvelocity = (ctx, node) => {
  const target = needObject(ctx, 'velocity');
  const physics = requirePhysics(ctx);
  const v = physics.getVelocity(target.id);
  if (!v) {
    warnOnce(ctx, 'velocity-read-nobody', `"${target.name}" has no dynamic physics body, so its velocity is 0.`, node.id);
    return 0;
  }
  return v[AXIS_INDEX[axisOf(node)]];
};

// Operators
reporters.operator_add = (ctx, node) => num(ctx, node, 'NUM1') + num(ctx, node, 'NUM2');
reporters.operator_subtract = (ctx, node) => num(ctx, node, 'NUM1') - num(ctx, node, 'NUM2');
reporters.operator_multiply = (ctx, node) => num(ctx, node, 'NUM1') * num(ctx, node, 'NUM2');
reporters.operator_divide = (ctx, node) => num(ctx, node, 'NUM1') / num(ctx, node, 'NUM2');
reporters.operator_mod = (ctx, node) => {
  const a = num(ctx, node, 'NUM1');
  const b = num(ctx, node, 'NUM2');
  if (b === 0) return 0;
  return ((a % b) + b) % b;
};
reporters.operator_round = (ctx, node) => Math.round(num(ctx, node, 'NUM'));
reporters.operator_mathop = (ctx, node) => {
  const op = field(node, 'OPERATOR');
  const x = num(ctx, node, 'NUM');
  const deg = Math.PI / 180;
  switch (op) {
    case 'abs':
      return Math.abs(x);
    case 'floor':
      return Math.floor(x);
    case 'ceil':
      return Math.ceil(x);
    case 'sqrt':
      return x < 0 ? 0 : Math.sqrt(x);
    case 'sin':
      return Math.sin(x * deg);
    case 'cos':
      return Math.cos(x * deg);
    case 'tan':
      return Math.tan(x * deg);
    case 'ln':
      return Math.log(x);
    default:
      throw new ScriptError(`Unknown math operation "${op}". Choose one of: ${MATH_OPERATORS.join(', ')}.`);
  }
};
reporters.operator_random = (ctx, node) => randomBetween(num(ctx, node, 'FROM', 1), num(ctx, node, 'TO', 10), () => ctx.core.rng());
reporters.operator_lt = (ctx, node) => compareValues(input(ctx, node, 'OPERAND1', ''), input(ctx, node, 'OPERAND2', '')) < 0;
reporters.operator_gt = (ctx, node) => compareValues(input(ctx, node, 'OPERAND1', ''), input(ctx, node, 'OPERAND2', '')) > 0;
reporters.operator_equals = (ctx, node) => equalsValues(input(ctx, node, 'OPERAND1', ''), input(ctx, node, 'OPERAND2', ''));
reporters.operator_and = (ctx, node) => bool(ctx, node, 'OPERAND1') && bool(ctx, node, 'OPERAND2');
reporters.operator_or = (ctx, node) => bool(ctx, node, 'OPERAND1') || bool(ctx, node, 'OPERAND2');
reporters.operator_not = (ctx, node) => !bool(ctx, node, 'OPERAND');
reporters.operator_join = (ctx, node) => text(ctx, node, 'STRING1') + text(ctx, node, 'STRING2');
reporters.operator_length = (ctx, node) => text(ctx, node, 'STRING').length;

reporters.data_variable = (ctx, node) => readVar(ctx, node);

export const STATEMENT_TYPES: ReadonlySet<string> = new Set(Object.keys(statements));
export const REPORTER_TYPES: ReadonlySet<string> = new Set([...Object.keys(reporters), 'bite_number', 'bite_text', 'bite_color']);

/** Test hook: lists the types with a runtime implementation (statement or reporter). */
export function implementedTypes(): Set<string> {
  return new Set([...STATEMENT_TYPES, ...REPORTER_TYPES]);
}

export { resolveObject };
