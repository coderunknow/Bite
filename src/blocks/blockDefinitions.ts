/**
 * Blockly block definitions, generated from the catalog so the editor can never show a block that the
 * runtime does not implement. Literal number/text inputs use a shadow block (`bite_value`) that holds the
 * typed value; a reporter can be dropped onto the same input to replace it.
 */
import * as Blockly from 'blockly';
import { BLOCK_SPECS, CATEGORIES, getBlockSpec, parseTemplate, type ArgSpec, type BlockSpec } from './catalog';
import { optionsFor, type OptionSource } from './options';

export const SHADOW_TYPE = 'bite_value';

const CATEGORY_COLOUR: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.colour]));

function sourceOf(arg: Extract<ArgSpec, { type: 'dropdown' }>): OptionSource | null {
  switch (arg.source.kind) {
    case 'static':
      return null;
    case 'keys':
      return 'keys';
    case 'objects':
      return 'objects';
    case 'objectsAndAny':
      return 'objectsAndAny';
    case 'cameras':
      return 'cameras';
    case 'variables':
      return 'variables';
    case 'messages':
      return 'messages';
    case 'sounds':
      return 'sounds';
  }
}

/** Dropdown for an argument: static options come from the catalog, the rest from the project. */
export function dropdownFor(arg: Extract<ArgSpec, { type: 'dropdown' }>): Blockly.FieldDropdown {
  if (arg.source.kind === 'static') {
    const opts = arg.source.options.map((o) => [o.label, o.value] as [string, string]);
    return new Blockly.FieldDropdown(opts);
  }
  const source = sourceOf(arg)!;
  return new Blockly.FieldDropdown(() => optionsFor(source));
}

function addDropdown(input: Blockly.Input, name: string, arg: Extract<ArgSpec, { type: 'dropdown' }>): void {
  input.appendField(dropdownFor(arg), name);
}

type BlockInitThis = Blockly.Block;

function shapeOf(spec: BlockSpec, self: BlockInitThis): void {
  switch (spec.shape) {
    case 'hat':
      self.setNextStatement(true);
      break;
    case 'statement':
      self.setPreviousStatement(true);
      self.setNextStatement(true);
      break;
    case 'c-block':
      self.setPreviousStatement(true);
      self.setNextStatement(true);
      break;
    case 'c-terminal':
      self.setPreviousStatement(true);
      break;
    case 'reporter':
      self.setOutput(true, null);
      break;
    case 'boolean':
      self.setOutput(true, 'Boolean');
      break;
  }
}

/** Builds the Blockly init function for one catalog entry. */
function initFor(spec: BlockSpec): (this: BlockInitThis) => void {
  return function init(this: BlockInitThis) {
    shapeOf(spec, this);
    this.setColour(CATEGORY_COLOUR[spec.category] ?? '#888888');
    this.setInputsInline(true);
    this.setTooltip(spec.tooltip);
    let current: Blockly.Input | null = null;
    for (const part of parseTemplate(spec.label)) {
      if (part.kind === 'text') {
        current ??= this.appendDummyInput();
        current.appendField(part.text);
      } else if (part.kind === 'newline') {
        current = null;
      } else if (part.kind === 'arg') {
        const arg = spec.args[part.name];
        if (!arg) throw new Error(`${spec.opcode}: label refers to unknown argument ${part.name}`);
        if (arg.type === 'dropdown') {
          current ??= this.appendDummyInput();
          addDropdown(current, part.name, arg);
        } else if (arg.type === 'number' || arg.type === 'text') {
          current = this.appendValueInput(part.name);
        } else if (arg.type === 'boolean') {
          current = this.appendValueInput(part.name).setCheck('Boolean');
        } else {
          current = null;
        }
      } else {
        // Statement input (C-block body).
        this.appendStatementInput(part.name);
        current = null;
      }
    }
  };
}

/** Shadow block holding a typed literal. */
const shadowDefinition = {
  init(this: BlockInitThis) {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput('0'), 'TEXT');
    this.setOutput(true, null);
    this.setColour('#ffffff');
    this.setStyle('bite_value_style');
  },
};

let defined = false;

/** Registers every block type once. Safe to call repeatedly. */
export function defineBlocks(): void {
  if (defined) return;
  defined = true;
  const defs: Record<string, unknown> = { [SHADOW_TYPE]: shadowDefinition };
  for (const spec of BLOCK_SPECS) defs[spec.opcode] = { init: initFor(spec) };
  Blockly.common.defineBlocks(defs as Parameters<typeof Blockly.common.defineBlocks>[0]);
}

/** Toolbox definition (JSON) for an object or the stage. Literal inputs get a shadow with the catalog default. */
export function toolboxFor(target: 'object' | 'stage'): Blockly.utils.toolbox.ToolboxDefinition {
  const contents = CATEGORIES.filter((c) => c.targets.includes(target)).map((cat) => ({
    kind: 'category' as const,
    name: cat.label,
    colour: cat.colour,
    contents: BLOCK_SPECS.filter((s) => s.category === cat.id && s.targets.includes(target)).map((spec) => toolboxBlock(spec)),
  }));
  return { kind: 'categoryToolbox', contents } as unknown as Blockly.utils.toolbox.ToolboxDefinition;
}

function toolboxBlock(spec: BlockSpec) {
  const inputs: Record<string, unknown> = {};
  const fields: Record<string, unknown> = {};
  for (const [name, arg] of Object.entries(spec.args)) {
    if (arg.type === 'number' || arg.type === 'text') {
      inputs[name] = { shadow: { type: SHADOW_TYPE, fields: { TEXT: String(arg.default) } } };
    }
    if (arg.type === 'dropdown') {
      const first = arg.source.kind === 'static' ? arg.source.options[0]?.value : arg.default;
      if (first !== undefined) fields[name] = first;
    }
  }
  return { kind: 'block', type: spec.opcode, inputs, fields };
}

export { getBlockSpec };
