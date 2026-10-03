import { expect, it } from 'vitest';
import { archiveProduct, initialize, restoreAndAdd, saveProduct } from './shopping';
import { normalizeProductName, sortProducts } from './products';
it('normaliza espaços, acentos e caixa sem permitir novos duplicados ativos ou arquivados', () => {
  const state = initialize(false); const original = state.products[0];
  const duplicate = { name: '  ' + original.name.toUpperCase().replaceAll(' ', '   ') + '  ', categoryId: state.categories[0].id };
  expect(() => saveProduct(state, duplicate)).toThrow('Já existe');
  const archived = archiveProduct(state, original.id); expect(() => saveProduct(archived, duplicate)).toThrow('Já existe');
  expect(() => saveProduct(archived, { ...duplicate, id: state.products[1].id })).toThrow('Já existe');
  expect(normalizeProductName('  CAFÉ   com  Leite ')).toBe('cafe com leite');
  expect(restoreAndAdd(archived, original.id).items[0].productId).toBe(original.id);
  expect(archived.products[0].archivedAt).not.toBeNull();
});
it('ordenação é uma projeção e nunca altera a ordem de cadastro', () => {
  const state = initialize(false); state.products = state.products.filter(p => p.categoryId === state.categories[0].id); const ids = state.products.map(p => p.id);
  const sorted = sortProducts(state.products, 'alphabetical');
  expect(sorted.map(p => p.name)).toEqual([...state.products].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true })).map(p => p.name));
  expect(state.products.map(p => p.id)).toEqual(ids); expect(sortProducts(sorted, 'created').map(p => p.id)).toEqual(ids);
});
