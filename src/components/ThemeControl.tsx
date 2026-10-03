import { useEffect, useLayoutEffect, useState } from 'react';

export const THEME_KEY = 'lista-compras-inteligente-theme';
type Theme = 'light' | 'dark';
const resolveTheme = (value: string | null): Theme => value === 'light' || value === 'dark' ? value : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

export function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return resolveTheme(localStorage.getItem(THEME_KEY)); } catch { return resolveTheme(null); }
  });
  const [error, setError] = useState('');
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171820' : '#F7F6F3');
  }, [theme]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setTheme(resolveTheme(event.newValue));
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); setError(''); }
    catch { setError('O tema foi aplicado, mas não foi possível salvar sua preferência neste navegador.'); }
  }
  const label = theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro';
  return <div className="appearance">
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={toggle}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {theme === 'dark' ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></> : <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>}
      </svg>
    </button>
    {error && <small role="status">{error}</small>}
  </div>;
}
