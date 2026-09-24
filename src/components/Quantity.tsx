import { useEffect, useRef, useState } from 'react';

export function Quantity({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  const original = useRef(value);
  const commit = useRef(onChange);
  useEffect(() => { if (!editing.current) setDraft(String(value)); }, [value]);
  return <div className="quantity">
    <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
    <input aria-label={`Quantidade de ${label}`} inputMode="numeric" value={draft} onFocus={() => {
      editing.current = true; original.current = value; commit.current = onChange;
    }} onChange={e => {
      setDraft(e.target.value);
    }} onBlur={() => {
      const n = Number(draft);
      editing.current = false;
      if (Number.isInteger(n) && n > 0 && n <= 9999 && n !== original.current) commit.current(n);
      setDraft(String(value));
    }} />
    <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= 9999} onClick={() => onChange(value + 1)}>+</button>
  </div>;
}
