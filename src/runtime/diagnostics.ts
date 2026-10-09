import type { LogEntry, LogLevel } from './types';

const MAX_ENTRIES = 500;

/**
 * Bounded diagnostics log. Identical consecutive messages are folded into one entry with a count, so a
 * script that fails every frame cannot flood the console.
 */
export class DiagnosticsLog {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<(entries: readonly LogEntry[]) => void>();

  add(level: LogLevel, message: string, time: number, context: { targetId?: string | null; targetName?: string | null; blockId?: string | null } = {}): LogEntry {
    const last = this.entries[this.entries.length - 1];
    const sameTarget = last && last.targetId === (context.targetId ?? null) && last.blockId === (context.blockId ?? null);
    if (last && last.message === message && last.level === level && sameTarget) {
      last.count += 1;
      last.time = time;
      this.emit();
      return last;
    }
    const entry: LogEntry = {
      id: this.nextId++,
      level,
      message,
      time,
      targetId: context.targetId ?? null,
      targetName: context.targetName ?? null,
      blockId: context.blockId ?? null,
      count: 1,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    this.emit();
    return entry;
  }

  info(message: string, time: number, context?: Parameters<DiagnosticsLog['add']>[3]): LogEntry {
    return this.add('info', message, time, context);
  }
  warn(message: string, time: number, context?: Parameters<DiagnosticsLog['add']>[3]): LogEntry {
    return this.add('warning', message, time, context);
  }
  error(message: string, time: number, context?: Parameters<DiagnosticsLog['add']>[3]): LogEntry {
    return this.add('error', message, time, context);
  }

  snapshot(): readonly LogEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries = [];
    this.emit();
  }

  subscribe(listener: (entries: readonly LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.entries);
  }
}
