import type { ReactNode } from 'react';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  kind?: 'checkbox' | 'button';
  tone?: 'selection' | 'success';
};

/** Shared visual control, preserving native checkbox and toggle-button semantics. */
export function SelectionControl({ checked, onChange, label, kind = 'checkbox', tone = 'selection' }: Props) {
  const mark: ReactNode = <span className="selection-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg></span>;
  if (kind === 'button') return <button type="button" className={`selection-control check ${tone}`} aria-label={label} aria-pressed={checked} onClick={() => onChange(!checked)}>{mark}</button>;
  return <span className={`selection-control ${tone}`}><input type="checkbox" aria-label={label} checked={checked} onChange={event => onChange(event.target.checked)} />{mark}</span>;
}
