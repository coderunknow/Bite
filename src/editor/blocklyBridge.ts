/**
 * Bridge between the Blockly workspace and the project's script JSON. The workspace is per target
 * (the Stage or one object); switching targets saves the old script before loading the new one.
 */
import * as Blockly from 'blockly';
import type { ScriptsJSON } from '../core/types';
import { buildToolbox, defineBiteBlocks, setOptionProvider, type OptionList, type OptionSource } from './blockDefs';

export interface BlockEditorOptions {
  container: HTMLElement;
  /** Called after a user edit to the scripts (not after programmatic loads). */
  onChange(): void;
  onNewVariable(): void;
  onNewMessage(): void;
  options(source: OptionSource): OptionList;
}

export class BlockEditor {
  private readonly workspace: Blockly.WorkspaceSvg;
  private loading = false;
  /** True when the last load failed: edits are disabled so the stored script is not overwritten. */
  private blocked = false;
  private readonly warned = new Set<string>();
  private readonly listener: (event: Blockly.Events.Abstract) => void;

  constructor(private readonly opts: BlockEditorOptions) {
    defineBiteBlocks();
    setOptionProvider(opts.options);
    this.workspace = Blockly.inject(opts.container, {
      toolbox: buildToolbox() as unknown as Blockly.utils.toolbox.ToolboxDefinition,
      // Icons and cursors ship with the app (public/blockly-media); nothing is fetched from a CDN.
      media: `${import.meta.env.BASE_URL}blockly-media/`,
      renderer: 'geras',
      trashcan: true,
      sounds: false,
      grid: { spacing: 24, length: 3, colour: '#d7e0ea', snap: true },
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 1.6, minScale: 0.4, scaleSpeed: 1.1 },
    });
    this.workspace.registerButtonCallback('BITE_NEW_VARIABLE', () => opts.onNewVariable());
    this.workspace.registerButtonCallback('BITE_NEW_MESSAGE', () => opts.onNewMessage());
    this.listener = (event) => {
      if (this.loading || this.blocked || event.isUiEvent) return;
      if (event.type === Blockly.Events.BLOCK_MOVE || event.type === Blockly.Events.BLOCK_CHANGE || event.type === Blockly.Events.BLOCK_CREATE || event.type === Blockly.Events.BLOCK_DELETE) {
        this.opts.onChange();
      }
    };
    this.workspace.addChangeListener(this.listener);
  }

  /**
   * Replaces the workspace content with the given scripts. Does not fire onChange.
   * Returns null on success. If the scripts cannot be loaded, the workspace is cleared and made
   * read-only and the error text is returned, so the stored script is never overwritten by a partial load.
   */
  load(scripts: ScriptsJSON | undefined): string | null {
    this.loading = true;
    this.blocked = false;
    this.workspace.setIsReadOnly(false);
    Blockly.Events.disable();
    let error: string | null = null;
    try {
      this.workspace.clear();
      this.warned.clear();
      if (scripts && scripts.blocks) {
        Blockly.serialization.workspaces.load(scripts as never, this.workspace, { recordUndo: false });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      this.workspace.clear();
      this.blocked = true;
    } finally {
      Blockly.Events.enable();
      this.loading = false;
    }
    this.workspace.setIsReadOnly(this.blocked);
    this.workspace.clearUndo();
    return error;
  }

  /** Current scripts as JSON (the format stored in the project). */
  save(): ScriptsJSON {
    return Blockly.serialization.workspaces.save(this.workspace) as ScriptsJSON;
  }

  /** Re-reads dropdown options (after variables, messages or sounds changed). Keeps current values. */
  refreshOptions(): void {
    for (const block of this.workspace.getAllBlocks(false)) {
      for (const input of block.inputList) {
        for (const field of input.fieldRow) {
          if (field instanceof Blockly.FieldDropdown) field.forceRerender();
        }
      }
    }
  }

  /** Marks blocks that produced runtime diagnostics. Pass an empty map to clear. */
  showBlockMessages(messages: Map<string, string>): void {
    for (const block of this.workspace.getAllBlocks(false)) {
      const message = messages.get(block.id);
      if (message) {
        block.setWarningText(message);
        this.warned.add(block.id);
      } else if (this.warned.has(block.id)) {
        block.setWarningText(null);
        this.warned.delete(block.id);
      }
    }
  }

  focusBlock(blockId: string): void {
    const block = this.workspace.getBlockById(blockId);
    if (block) block.select();
  }

  blockCount(): number {
    return this.workspace.getAllBlocks(false).length;
  }

  resize(): void {
    Blockly.svgResize(this.workspace);
  }

  dispose(): void {
    this.workspace.removeChangeListener(this.listener);
    this.workspace.dispose();
  }
}
