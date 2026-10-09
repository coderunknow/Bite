import { Component, useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Text input that commits on blur or Enter. Escape reverts. Empty or unchanged values are not committed. */
export function TextField(props: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  testId?: string;
}) {
  const { label, value, onCommit, maxLength, placeholder, testId } = props;
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value);
      return;
    }
    const next = draft.trim();
    if (next === '' || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="text"
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

/** Number input that commits on blur or Enter. Values that are not finite are reverted. */
export function NumberField(props: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  testId?: string;
}) {
  const { label, value, onCommit, step, min, max, testId } = props;
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(round(value)));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    if (clamped !== value) onCommit(clamped);
    setDraft(String(round(clamped)));
  };
  return (
    <label className="field num">
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        step={step ?? 'any'}
        min={min}
        max={max}
        data-testid={testId}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

/** Three number fields for a vector. */
export function VectorField(props: {
  label: string;
  value: [number, number, number];
  onCommit: (value: [number, number, number]) => void;
  step?: number;
  min?: number;
  max?: number;
  testPrefix?: string;
}) {
  const { label, value, onCommit, step, min, max, testPrefix } = props;
  const axes = ['X', 'Y', 'Z'] as const;
  return (
    <fieldset className="vector">
      <legend>{label}</legend>
      <div className="vector-row">
        {axes.map((axis, i) => (
          <NumberField
            key={axis}
            label={axis}
            value={value[i]}
            step={step}
            min={min}
            max={max}
            testId={testPrefix ? `${testPrefix}-${axis.toLowerCase()}` : undefined}
            onCommit={(v) => {
              const next = [...value] as [number, number, number];
              next[i] = v;
              onCommit(next);
            }}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function SelectField(props: {
  label: string;
  value: string;
  options: Array<[label: string, value: string]>;
  onChange: (value: string) => void;
  testId?: string;
}) {
  const { label, value, options, onChange, testId } = props;
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} data-testid={testId} onChange={(e) => onChange(e.target.value)}>
        {options.map(([text, optionValue]) => (
          <option key={optionValue} value={optionValue}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckField(props: { label: string; checked: boolean; onChange: (checked: boolean) => void; testId?: string }) {
  return (
    <label className="field check">
      <input type="checkbox" checked={props.checked} data-testid={props.testId} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

export function ColorField(props: { label: string; value: string; onChange: (value: string) => void; testId?: string }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input type="color" value={props.value} data-testid={props.testId} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  );
}

export function Modal(props: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, button');
    first?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onClose();
      }}
    >
      <div className={`modal${props.wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref}>
        <header>
          <h2 id={titleId}>{props.title}</h2>
          <button type="button" className="ghost" aria-label="Close" onClick={props.onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{props.children}</div>
      </div>
    </div>
  );
}

function round(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : 0;
}

export function Section(props: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>{props.title}</h3>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

/** Keeps one panel's unexpected render error from blanking the whole studio. The project is not changed. */
export class PanelBoundary extends Component<{ name: string; children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  override componentDidCatch(err: unknown) {
    console.error(`[Bite] ${this.props.name} failed`, err);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="banner error panel-error" role="alert" data-testid={`panel-error-${this.props.name}`}>
          The {this.props.name} panel hit an error: {this.state.error}. Your project is saved; reload the page to recover.
        </div>
      );
    }
    return this.props.children;
  }
}
