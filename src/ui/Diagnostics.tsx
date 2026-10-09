import type { Studio } from '../app/studio';
import { useStudio } from './useStudio';
import { STAGE_TARGET_ID } from '../core/types';

/** Runtime log: warnings and errors from blocks, sounds and physics. Click a block message to find the block. */
export function Diagnostics({ studio }: { studio: Studio }) {
  const logs = useStudio(studio, (s) => s.logs);
  const project = useStudio(studio, (s) => s.project);
  const names = (targetId: string | null) => {
    if (targetId === null) return 'Program';
    if (targetId === STAGE_TARGET_ID) return 'Stage';
    return project?.objects.find((o) => o.id === targetId)?.name ?? 'Deleted object';
  };
  const entries = [...logs].reverse();
  return (
    <section className="diagnostics" aria-label="Diagnostics" data-testid="diagnostics">
      <div className="panel-head">
        <h2>Diagnostics</h2>
        <span className="muted">{logs.length} message(s)</span>
        <button type="button" onClick={() => studio.engine.clearLogs()} disabled={logs.length === 0}>
          Clear
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="muted">Nothing to report. Warnings and errors from running scripts appear here.</p>
      ) : (
        <ol className="log">
          {entries.map((entry, index) => (
            <li key={`${entry.time}-${index}`} className={entry.level}>
              <span className="level">{entry.level}</span>
              <span className="time">{entry.time.toFixed(2)}s</span>
              <span className="who">{names(entry.targetId)}</span>
              <span className="text">{entry.message}</span>
              {entry.blockId && entry.targetId !== null && (
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    studio.setScriptTarget(entry.targetId!);
                    studio.selectObject(entry.targetId === STAGE_TARGET_ID ? null : entry.targetId);
                    studio.focusBlock(entry.blockId!);
                  }}
                >
                  Show block
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
