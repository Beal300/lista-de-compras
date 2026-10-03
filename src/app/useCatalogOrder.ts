import { useEffect, useState } from 'react';
import type { CatalogOrder } from '../domain/products';
export const ORDER_KEY = 'lista-compras-inteligente-order';
const parse = (value: string | null): CatalogOrder => value === 'alphabetical' ? 'alphabetical' : 'created';
export function useCatalogOrder() {
  const [order, setOrder] = useState<CatalogOrder>(() => { try { return parse(localStorage.getItem(ORDER_KEY)); } catch { return 'created'; } });
  const [error, setError] = useState('');
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === ORDER_KEY || event.key === null) setOrder(parse(event.newValue)); };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, []);
  function choose(value: string) {
    const next = parse(value); setOrder(next);
    try { localStorage.setItem(ORDER_KEY, next); setError(''); }
    catch { setError('A ordenação foi aplicada, mas não foi possível salvar a preferência neste navegador.'); }
  }
  return { order, choose, error };
}
