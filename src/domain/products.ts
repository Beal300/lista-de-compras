import type { Product } from './models';

// Shared by search and writes: spaces, accents and case do not create a new name.
export const normalizeProductName = (name: string) => name.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export class DuplicateProductError extends Error {
  constructor() { super('Já existe um produto com esse nome, inclusive entre os arquivados. Use ou restaure o produto existente.'); }
}
export function assertUniqueProductName(products: Product[], name: string, exceptId?: string) {
  if (products.some(p => !p.deletedAt && p.id !== exceptId && normalizeProductName(p.name) === normalizeProductName(name))) throw new DuplicateProductError();
}
export type CatalogOrder = 'created' | 'alphabetical';
export function sortProducts(products: Product[], order: CatalogOrder): Product[] {
  return [...products].sort((a, b) => order === 'alphabetical'
    ? a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true }) || a.sortOrder - b.sortOrder
    : a.sortOrder - b.sortOrder);
}
