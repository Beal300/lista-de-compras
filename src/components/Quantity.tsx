import { useEffect, useState } from 'react';

export function Quantity({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return <div className="quantity">
    <button type="button" aria-label={`Diminuir ${label}`} disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
    <input aria-label={`Quantidade de ${label}`} inputMode="numeric" value={draft} onChange={e => {
      setDraft(e.target.value);
      const n = Number(e.target.value);
      if (Number.isInteger(n) && n > 0 && n <= 9999) onChange(n);
    }} onBlur={() => setDraft(String(value))} />
    <button type="button" aria-label={`Aumentar ${label}`} disabled={value >= 9999} onClick={() => onChange(value + 1)}>+</button>
  </div>;
}
