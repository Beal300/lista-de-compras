import { useEffect, useState } from 'react';

export const THEME_KEY = 'lista-compras-inteligente-theme';
type Theme = 'light' | 'dark' | 'auto';
const parseTheme = (value: string | null): Theme => value === 'light' || value === 'dark' ? value : 'auto';

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return parseTheme(localStorage.getItem(THEME_KEY)); } catch { return 'auto'; }
  });
  const [error, setError] = useState('');
  useEffect(() => {
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'auto' ? (system.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#17221e' : '#236451');
    };
    apply(); system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setTheme(parseTheme(event.newValue));
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  return <div className="appearance">
    <label htmlFor="appearance">Aparência</label>
    <select id="appearance" value={theme} onChange={event => {
      const next = parseTheme(event.target.value); setTheme(next);
      try { localStorage.setItem(THEME_KEY, next); setError(''); }
      catch { setError('O tema foi aplicado, mas não foi possível salvar sua preferência neste navegador.'); }
    }}>
      <option value="light">Claro</option><option value="dark">Escuro</option><option value="auto">Automático</option>
    </select>
    {error && <small role="status">{error}</small>}
  </div>;
}
