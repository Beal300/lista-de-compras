import { describe, expect, it } from 'vitest';
import seed from '../data/seed.json';
import { activeItems, archiveProduct, finishShopping, initialize, quickAdd, reviewSelection, saveProduct, selectProducts, updateItem } from './shopping';
import { LocalStorageRepository, STORAGE_KEY } from '../persistence/repository';

describe('catálogo e compras', () => {
  it('revisão substitui a seleção, preserva carrinho/IDs/histórico e aceita desmarcar tudo', () => {
    let s = initialize(true);
    s = updateItem(s, s.items[0].id, { status: 'pending' });
    s = finishShopping(s, 'carry_forward');
    const history = structuredClone(s.items.filter(i => i.listId === s.lists[0].id));
    const existing = activeItems(s)[0];
    s = updateItem(s, existing.id, { status: 'in_cart' });
    const otherId = s.products[1].id;
    const reviewed = reviewSelection(s, { [existing.productId]: 8, [otherId]: 2 });
    expect(activeItems(reviewed)).toHaveLength(2);
    expect(activeItems(reviewed)[0]).toMatchObject({ id: existing.id, quantity: 8, status: 'in_cart' });
    expect(activeItems(reviewed)[1]).toMatchObject({ productId: otherId, quantity: 2, status: 'pending' });
    const removed = reviewSelection(reviewed, { [otherId]: 2 });
    expect(activeItems(removed)).toHaveLength(1);
    const empty = reviewSelection(removed, {}); expect(activeItems(empty)).toHaveLength(0);
    expect(empty.items).toEqual(history); expect(empty.products).toEqual(s.products);
  });
  it('mantém um produto arquivado já presente quando a revisão o seleciona', () => {
    let s = initialize(true); const item = s.items[0];
    s = archiveProduct(s, item.productId);
    expect(activeItems(reviewSelection(s, { [item.productId]: 9 }))[0]).toMatchObject({ id: item.id, quantity: 9, status: 'in_cart' });
  });
  it('importa 92 produtos, três categorias e lista vazia com IDs estáveis', () => {
    const s = initialize(false);
    expect(s.products).toHaveLength(92); expect(s.categories).toHaveLength(3); expect(s.items).toHaveLength(0);
    expect(s.products.map(p => p.id)).toEqual(initialize(false).products.map(p => p.id));
    expect(s.products.every(p => p.name === p.name.trim())).toBe(true);
  });
  it('preserva quantidades e TRUE/FALSE de todos os produtos positivos', () => {
    const s = initialize(true); expect(s.items).toHaveLength(17);
    expect(s.items.reduce((sum, i) => sum + i.quantity, 0)).toBe(44);
    for (const p of seed.products.filter(p => p.initialQuantity > 0)) expect(s.items.find(i => i.productId === p.id)).toMatchObject({ quantity: p.initialQuantity, status: p.initialStatus });
  });
  it('importa positivo FALSE como pendente e ignora zero mesmo com TRUE', () => {
    const original = structuredClone(seed.products[0]);
    try {
      seed.products[0].initialStatus = 'pending'; seed.products[0].initialQuantity = 3;
      expect(initialize(true).items.find(i => i.productId === original.id)).toMatchObject({ quantity: 3, status: 'pending' });
      seed.products[0].initialQuantity = 0; seed.products[0].initialStatus = 'in_cart';
      expect(initialize(true).items.some(i => i.productId === original.id)).toBe(false);
    } finally { Object.assign(seed.products[0], original); }
  });
  it('inclui somente selecionados e permite revisar quantidade sem mudar carrinho', () => {
    let s = initialize(false); const id = s.products[0].id;
    s = selectProducts(s, { [id]: 3 }); expect(activeItems(s)).toHaveLength(1);
    s = updateItem(s, s.items[0].id, { status: 'in_cart' });
    s = selectProducts(s, { [id]: 5 }); expect(activeItems(s)[0]).toMatchObject({ quantity: 5, status: 'in_cart' });
  });
  it('adição rápida cria com 1, incrementa e devolve para pendente', () => {
    let s = initialize(false); const id = s.products[0].id;
    s = quickAdd(s, id); expect(s.items[0]).toMatchObject({ quantity: 1, status: 'pending' });
    s = updateItem(s, s.items[0].id, { status: 'in_cart' }); s = quickAdd(s, id);
    expect(s.items[0]).toMatchObject({ quantity: 2, status: 'pending' }); expect(s.items).toHaveLength(1);
  });
  it('altera quantidades e estados e rejeita quantidades inválidas', () => {
    let s = initialize(true); const id = s.items[0].id;
    s = updateItem(s, id, { quantity: 8, status: 'pending' }); expect(s.items[0]).toMatchObject({ quantity: 8, status: 'pending' });
    for (const quantity of [0, -1, 1.2, NaN, 10000]) expect(() => updateItem(s, id, { quantity })).toThrow();
  });
  it.each(['carry_forward', 'discard'] as const)('finaliza usando %s e preserva catálogo/histórico', policy => {
    let s = initialize(true); s = updateItem(s, s.items[0].id, { status: 'pending', quantity: 7 });
    const before = structuredClone(s); const result = finishShopping(s, policy);
    expect(result.products).toEqual(before.products); expect(result.items.slice(0, before.items.length)).toEqual(before.items);
    expect(result.lists.filter(l => l.status === 'active')).toHaveLength(1); expect(result.lists[0].status).toBe('completed');
    expect(activeItems(result)).toHaveLength(policy === 'carry_forward' ? 1 : 0);
    if (policy === 'carry_forward') { expect(activeItems(result)[0]).toMatchObject({ quantity: 7, status: 'pending', carriedFromItemId: before.items[0].id }); expect(activeItems(result)[0].id).not.toBe(before.items[0].id); }
    expect(() => updateItem(result, before.items[0].id, { quantity: 2 })).toThrow();
    expect(s).toEqual(before);
  });
  it('cadastra, edita, move, arquiva e restaura sem alterar o histórico', () => {
    let s = finishShopping(initialize(true), 'discard'); const history = structuredClone(s.items); const id = s.products[0].id;
    s = saveProduct(s, { id, name: '  Novo   nome ', categoryId: s.categories[1].id });
    expect(s.products[0]).toMatchObject({ name: 'Novo nome', categoryId: s.categories[1].id });
    s = archiveProduct(s, id); expect(() => quickAdd(s, id)).toThrow();
    s = archiveProduct(s, id); expect(s.products[0].archivedAt).toBeNull();
    s = saveProduct(s, { name: 'Produto extra', categoryId: s.categories[0].id }); expect(s.products).toHaveLength(93); expect(s.items).toEqual(history);
  });
});

describe('persistência protegida', () => {
  function memory() { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } }; }
  it('recarrega todos os dados sem reinicializar nem perder edições', () => {
    const storage = memory(); const r = new LocalStorageRepository(storage); expect(r.load()).toBeNull();
    let s = initialize(true); s = saveProduct(s, { name: 'Meu produto', categoryId: s.categories[0].id }); r.save(s);
    expect(new LocalStorageRepository(storage).load()).toEqual(s);
  });
  it.each(['{inválido', '{"schemaVersion":99}', 'null'])('preserva conteúdo inválido %s', raw => {
    const storage = memory(); storage.setItem(STORAGE_KEY, raw); const r = new LocalStorageRepository(storage);
    expect(() => r.load()).toThrow(); expect(() => r.save(initialize(false))).toThrow(); expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it('rejeita relações inválidas', () => {
    const storage = memory(); const s = initialize(true); s.items[0].productId = 'inexistente'; storage.setItem(STORAGE_KEY, JSON.stringify(s));
    expect(() => new LocalStorageRepository(storage).load()).toThrow();
  });
  it('detecta alteração em outra aba', () => {
    const storage = memory(); const a = new LocalStorageRepository(storage), b = new LocalStorageRepository(storage); a.load(); b.load(); a.save(initialize(false)); expect(() => b.save(initialize(false))).toThrow(/outra aba/);
  });
  it('não mascara falhas de escrita', () => {
    const r = new LocalStorageRepository({ getItem: () => null, setItem: () => { throw new Error('Quota excedida'); } }); r.load(); expect(() => r.save(initialize(false))).toThrow('Quota excedida');
  });
});
