/**
 * Blockly workspace controller and the two-way bridge between Blockly blocks and the BlockNode model.
 * Blockly is only the editing surface: the saved truth is always the Script/BlockNode data, read back
 * with `readScripts`. Block ids are preserved so runtime highlights and errors map onto the blocks.
 */
import * as Blockly from 'blockly';
import { getBlockSpec } from './catalog';
import { defineBlocks, SHADOW_TYPE, toolboxFor } from './blockDefinitions';
import { clearMissing, noteMissing, setProjectOptions, type ProjectOptions } from './options';
import type { ArgSpec } from './catalog';
import type { BlockNode, InputValue, Script } from '../model/types';
import { parseNumeric } from '../runtime/values';

export interface CodeEditorHandlers {
  /** Called after a user edit (not after programmatic loads). */
  onChange(scripts: Script[]): void;
}

const THEME_NAME = 'bite-dark';

function ensureTheme(): Blockly.Theme {
  return Blockly.Theme.defineTheme(THEME_NAME, {
    name: THEME_NAME,
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#171d29',
      toolboxBackgroundColour: '#202838',
      toolboxForegroundColour: '#e6ebf5',
      flyoutBackgroundColour: '#1b2231',
      flyoutForegroundColour: '#e6ebf5',
      flyoutOpacity: 0.95,
      scrollbarColour: '#3c4a5e',
      insertionMarkerColour: '#ffffff',
      insertionMarkerOpacity: 0.3,
      markerColour: '#ffd34d',
      cursorColour: '#ffd34d',
      selectedGlowColour: '#ffd34d',
      selectedGlowOpacity: 0.8,
    },
  });
}

/** Reads a value input: a literal (shadow) or a nested reporter. Returns undefined when empty. */
function readInput(block: Blockly.Block, name: string, arg: ArgSpec): InputValue | undefined {
  const target = block.getInput(name)?.connection?.targetBlock();
  if (!target) return undefined;
  if (target.isShadow()) {
    const text = String(target.getFieldValue('TEXT') ?? '');
    if (arg.type === 'number') {
      const n = parseNumeric(text);
      return n ?? text;
    }
    return text;
  }
  return readBlock(target) ?? undefined;
}

/** Converts a Blockly block (and its inputs and stacks) to a BlockNode. Returns null for unknown types. */
export function readBlock(block: Blockly.Block): BlockNode | null {
  const spec = getBlockSpec(block.type);
  if (!spec) return null;
  const node: BlockNode = { id: block.id, opcode: block.type };
  const fields: Record<string, string> = {};
  const inputs: Record<string, InputValue> = {};
  const stacks: Record<string, BlockNode[]> = {};
  for (const [name, arg] of Object.entries(spec.args)) {
    if (arg.type === 'dropdown') {
      fields[name] = String(block.getFieldValue(name) ?? '');
    } else if (arg.type === 'stack') {
      stacks[name] = readChain(block.getInput(name)?.connection?.targetBlock() ?? null);
    } else {
      const v = readInput(block, name, arg);
      if (v !== undefined) inputs[name] = v;
    }
  }
  if (Object.keys(fields).length) node.fields = fields;
  if (Object.keys(inputs).length) node.inputs = inputs;
  if (Object.keys(stacks).length || hasStackInputs(spec.args)) node.stacks = stacks;
  return node;
}

function hasStackInputs(args: Record<string, ArgSpec>): boolean {
  return Object.values(args).some((a) => a.type === 'stack');
}

/** Follows next-connections from `first` and returns the nodes in order. */
function readChain(first: Blockly.Block | null): BlockNode[] {
  const out: BlockNode[] = [];
  for (let b: Blockly.Block | null = first; b; b = b.getNextBlock()) {
    if (b.isShadow()) continue;
    const n = readBlock(b);
    if (n) out.push(n);
  }
  return out;
}

/** Reads every top-level stack of the workspace as a script. The first node is the top block (hat or not). */
export function readScripts(ws: Blockly.WorkspaceSvg): Script[] {
  const scripts: Script[] = [];
  for (const top of ws.getTopBlocks(true)) {
    const nodes = readChain(top);
    if (nodes.length === 0) continue;
    const xy = top.getRelativeToSurfaceXY();
    scripts.push({ id: top.id, position: { x: Math.round(xy.x), y: Math.round(xy.y) }, nodes });
  }
  return scripts;
}

function createBlock(ws: Blockly.WorkspaceSvg, node: BlockNode): Blockly.BlockSvg {
  const spec = getBlockSpec(node.opcode);
  if (!spec) throw new Error(`Unknown block type ${node.opcode}`);
  const block = ws.newBlock(node.opcode, node.id) as Blockly.BlockSvg;
  block.initSvg();
  block.render();
  for (const [name, arg] of Object.entries(spec.args)) {
    if (arg.type === 'dropdown') {
      const value = node.fields?.[name] ?? (arg.source.kind === 'static' ? arg.source.options[0]?.value : arg.default) ?? '';
      if (arg.source.kind !== 'static') noteMissing(arg.source.kind, String(value));
      block.setFieldValue(String(value), name);
    }
  }
  for (const [name, arg] of Object.entries(spec.args)) {
    const input = block.getInput(name);
    if (arg.type === 'number' || arg.type === 'text') {
      const v = node.inputs?.[name];
      if (typeof v === 'object') {
        connectChild(input, createBlock(ws, v));
      } else {
        const text = v === undefined ? String(arg.default) : String(v);
        input?.connection?.setShadowState({ type: SHADOW_TYPE, fields: { TEXT: text } });
      }
    } else if (arg.type === 'boolean') {
      const v = node.inputs?.[name];
      if (v && typeof v === 'object') connectChild(input, createBlock(ws, v));
    } else if (arg.type === 'stack') {
      const chain = node.stacks?.[name] ?? [];
      if (chain.length > 0 && input?.connection) {
        const first = createBlock(ws, chain[0]!);
        input.connection.connect(first.previousConnection!);
        connectChain(ws, first, chain.slice(1));
      }
    }
  }
  return block;
}

function connectChild(input: Blockly.Input | null, child: Blockly.BlockSvg): void {
  if (!input?.connection || !child.outputConnection) return;
  input.connection.connect(child.outputConnection);
}

function connectChain(ws: Blockly.WorkspaceSvg, prev: Blockly.BlockSvg, rest: BlockNode[]): void {
  let last = prev;
  for (const n of rest) {
    const next = createBlock(ws, n);
    last.nextConnection!.connect(next.previousConnection!);
    last = next;
  }
}

export class CodeEditor {
  private readonly ws: Blockly.WorkspaceSvg;
  private loading = false;
  private target: string | null = null;
  private targetKind: 'object' | 'stage' | null = null;
  private highlighted = new Set<string>();
  private warnings = new Map<string, string>();
  private changeTimer: number | null = null;
  private readonly unsubscribe: () => void;

  constructor(
    container: HTMLElement,
    private readonly handlers: CodeEditorHandlers,
  ) {
    defineBlocks();
    // Blockly's icons come from our own origin (public/blockly/media) and its click sounds are off:
    // the app makes no remote requests and plays no UI sounds in the editor.
    this.ws = Blockly.inject(container, {
      media: './blockly/media/',
      sounds: false,
      toolbox: toolboxFor('object'),
      theme: ensureTheme(),
      renderer: 'geras',
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 1.6, minScale: 0.4, scaleSpeed: 1.1 },
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 24, length: 2, colour: '#2a3446', snap: true },
    });
    const listener = (e: Blockly.Events.Abstract) => this.onEvent(e);
    this.ws.addChangeListener(listener);
    this.unsubscribe = () => this.ws.removeChangeListener(listener);
  }

  get currentTarget(): string | null {
    return this.target;
  }

  /** Loads the scripts of a target into the workspace. The toolbox switches between object and stage blocks. */
  load(target: string, kind: 'object' | 'stage', scripts: Script[], options: ProjectOptions): void {
    setProjectOptions(options);
    clearMissing();
    this.loading = true;
    try {
      this.ws.clear();
      this.clearWarnings();
      if (this.targetKind !== kind) {
        this.ws.updateToolbox(toolboxFor(kind));
        this.targetKind = kind;
      }
      this.target = target;
      for (const s of scripts) {
        const first = createBlock(this.ws, s.nodes[0]!);
        connectChain(this.ws, first, s.nodes.slice(1));
        const at = first.getRelativeToSurfaceXY();
        first.moveBy(s.position.x - at.x, s.position.y - at.y);
      }
    } finally {
      this.loading = false;
    }
  }

  /** Read-only while a Play session runs. */
  setReadOnly(readOnly: boolean): void {
    this.ws.setIsReadOnly(readOnly);
  }

  /** Refreshes dropdown source data (objects, variables...) without reloading blocks. */
  setOptions(options: ProjectOptions): void {
    setProjectOptions(options);
  }

  /** Marks running blocks. Replaces the previous set. */
  highlight(ids: Set<string>): void {
    for (const id of this.highlighted) {
      if (!ids.has(id)) (this.ws.getBlockById(id) as Blockly.BlockSvg | null)?.removeSelect();
    }
    for (const id of ids) {
      if (!this.highlighted.has(id)) (this.ws.getBlockById(id) as Blockly.BlockSvg | null)?.addSelect();
    }
    this.highlighted = new Set(ids);
  }

  /** Shows an error on a block (Blockly warning bubble). */
  setError(blockId: string, message: string): void {
    const b = this.ws.getBlockById(blockId) as Blockly.BlockSvg | null;
    if (!b) return;
    b.setWarningText(message);
    this.warnings.set(blockId, message);
  }

  clearWarnings(): void {
    for (const id of this.warnings.keys()) {
      (this.ws.getBlockById(id) as Blockly.BlockSvg | null)?.setWarningText(null);
    }
    this.warnings.clear();
  }

  hasBlock(id: string): boolean {
    return this.ws.getBlockById(id) !== null;
  }

  resize(): void {
    Blockly.svgResize(this.ws);
  }

  dispose(): void {
    if (this.changeTimer !== null) window.clearTimeout(this.changeTimer);
    this.unsubscribe();
    this.ws.dispose();
  }

  private onEvent(e: Blockly.Events.Abstract): void {
    if (this.loading || e.isUiEvent) return;
    if (this.changeTimer !== null) window.clearTimeout(this.changeTimer);
    this.changeTimer = window.setTimeout(() => {
      this.changeTimer = null;
      this.handlers.onChange(readScripts(this.ws));
    }, 150);
  }
}
