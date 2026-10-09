import { useState, type ReactNode } from 'react';

interface FieldRowProps {
  label: string;
  children: ReactNode;
  testId?: string;
}

export function FieldRow({ label, children, testId }: FieldRowProps) {
  return (
    <label className="field" data-testid={testId}>
      <span className="field-label">{label}</span>
      <span className="field-control">{children}</span>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  step?: number;
  min?: number;
  max?: number;
  testId?: string;
}

/** Numeric input that commits on Enter or blur. Text that is not a finite number is rejected and reverted. */
export function NumberField({ label, value, onCommit, disabled, step = 0.1, min, max, testId }: NumberFieldProps) {
  const [text, setText] = useState(formatNumber(value));
  const [error, setError] = useState<string | null>(null);
  // Resynchronise the draft when the project value changes (React's "adjust state during render" pattern).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(formatNumber(value));
    setError(null);
  }
  const commit = () => {
    const n = Number(text.trim());
    if (text.trim() === '' || !Number.isFinite(n)) {
      setError('Enter a number');
      setText(formatNumber(value));
      return;
    }
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
      setError(`Must be between ${min ?? '-∞'} and ${max ?? '∞'}`);
      setText(formatNumber(value));
      return;
    }
    setError(null);
    if (n !== value) onCommit(n);
  };
  return (
    <FieldRow label={label} testId={testId}>
      <input
        className={error ? 'num invalid' : 'num'}
        type="number"
        step={step}
        min={min}
        max={max}
        value={text}
        disabled={disabled}
        aria-label={label}
        title={error ?? undefined}
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    </FieldRow>
  );
}

function formatNumber(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : '0';
}

interface TextFieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  testId?: string;
}

export function TextField({ label, value, onCommit, disabled, placeholder, maxLength = 120, testId }: TextFieldProps) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  return (
    <FieldRow label={label} testId={testId}>
      <input
        className="text"
        type="text"
        value={text}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={label}
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== value) onCommit(text);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setText(value);
        }}
      />
    </FieldRow>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  testId?: string;
}

export function SelectField({ label, value, options, onChange, disabled, testId }: SelectFieldProps) {
  return (
    <FieldRow label={label} testId={testId}>
      <select className="select" value={value} disabled={disabled} aria-label={label} data-testid={testId ? `${testId}-input` : undefined} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

interface CheckFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
}

export function CheckField({ label, checked, onChange, disabled, testId }: CheckFieldProps) {
  return (
    <label className="field check" data-testid={testId}>
      <input type="checkbox" checked={checked} disabled={disabled} aria-label={label} data-testid={testId ? `${testId}-input` : undefined} onChange={(e) => onChange(e.target.checked)} />
      <span className="field-label">{label}</span>
    </label>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onCommit: (hex: string) => void;
  disabled?: boolean;
  testId?: string;
}

export function ColorField({ label, value, onCommit, disabled, testId }: ColorFieldProps) {
  return (
    <FieldRow label={label} testId={testId}>
      <input
        className="color"
        type="color"
        value={value}
        disabled={disabled}
        aria-label={label}
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => onCommit(e.target.value)}
      />
    </FieldRow>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="section">
      <header className="section-head">
        <h3>{title}</h3>
        {actions}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}
