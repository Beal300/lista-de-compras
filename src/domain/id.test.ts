import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './id';
import { initialize, quickAdd, saveProduct, finishShopping } from './shopping';

afterEach(() => vi.unstubAllGlobals());
describe('identificadores em HTTP e HTTPS', () => {
  it('usa randomUUID quando disponível', () => {
    const randomUUID = vi.fn(() => 'e877c760-ad07-4bde-ae22-9e377bec89ab');
    vi.stubGlobal('crypto', { randomUUID }); expect(createId()).toBe(randomUUID()); expect(randomUUID).toHaveBeenCalledTimes(2);
  });
  it('gera UUID v4 aleatório sem randomUUID e suporta todas as criações', () => {
    const getRandomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal('crypto', { getRandomValues });
    const ids = Array.from({ length: 1000 }, createId);
    expect(new Set(ids).size).toBe(1000);
    expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
    let s = initialize(false); s = quickAdd(s, s.products[0].id);
    s = saveProduct(s, { name: 'Produto HTTP', categoryId: s.categories[0].id });
    s = finishShopping(s, 'carry_forward'); expect(s.lists).toHaveLength(2); expect(s.products).toHaveLength(93);
    expect(initialize(true).items).toHaveLength(17);
  });
  it('explica a ausência de geração segura sem usar aleatoriedade fraca', () => {
    vi.stubGlobal('crypto', undefined); expect(createId).toThrow('geração segura de identificadores');
  });
});
