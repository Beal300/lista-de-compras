import { assertUniqueProductName, normalizeProductName } from './products';
import seed from '../data/seed.json';
import { stateSchema, type AppState, type Selection, type ShoppingListItem, type Product } from './models';
import { createId } from './id';

const now = () => new Date().toISOString();
const meta = (workspaceId: string) => ({ id: createId(), workspaceId, createdAt: now(), updatedAt: now(), deletedAt: null });
export const activeList = (s: AppState) => s.lists.find(l => l.status === 'active')!;
export const activeItems = (s: AppState) => s.items.filter(i => i.listId === activeList(s).id);
export function initialize(withList: boolean): AppState {
  const workspaceId = createId();
  const s: AppState = { schemaVersion: 1, revision: 0, workspaceId,
    categories: seed.categories.map(c => ({ ...meta(workspaceId), ...c })),
    products: seed.products.map(({ initialQuantity: _q, initialStatus: _s, ...p }) => ({ ...meta(workspaceId), ...p, unit: 'unid', archivedAt: null })),
    lists: [{ ...meta(workspaceId), name: 'Minha lista', status: 'active', completedAt: null, previousListId: null, pendingPolicy: null, amountCents: null, receipt: null }], items: [] };
  if (withList) for (const p of seed.products.filter(p => p.initialQuantity > 0)) {
    s.items.push(makeItem(s, p.id, p.initialQuantity, p.initialStatus as ShoppingListItem['status']));
  }
  return stateSchema.parse(s);
}
function makeItem(s: AppState, productId: string, quantity: number, status: ShoppingListItem['status'] = 'pending'): ShoppingListItem {
  const p = s.products.find(p => p.id === productId && !p.archivedAt && !p.deletedAt);
  if (!p) throw new Error('Produto indisponível no catálogo.');
  return { ...meta(s.workspaceId), listId: activeList(s).id, productId, quantity, status, productSnapshot: { name: p.name, unit: p.unit, categoryName: s.categories.find(c => c.id === p.categoryId)!.name }, carriedFromItemId: null };
}
function change(s: AppState, action: (draft: AppState) => void): AppState {
  const draft = structuredClone(s); action(draft); draft.revision++;
  return stateSchema.parse(draft);
}
export function selectProducts(s: AppState, selection: Selection) {
  return change(s, d => {
    for (const [id, quantity] of Object.entries(selection)) {
      const existing = activeItems(d).find(i => i.productId === id);
      if (existing) { existing.quantity = quantity; existing.updatedAt = now(); }
      else d.items.push(makeItem(d, id, quantity));
    }
  });
}
export function quickAdd(s: AppState, productId: string) {
  const item = activeItems(s).find(i => i.productId === productId);
  if (!item) return selectProducts(s, { [productId]: 1 });
  return updateItem(s, item.id, { quantity: item.quantity + 1, status: 'pending' });
}
// Full review replaces only the active list selection. Existing items retain IDs,
// snapshots and cart state; historical lists are never edited.
export function reviewSelection(s: AppState, selection: Selection) {
  const selected = selectProducts(s, selection);
  const listId = activeList(selected).id;
  selected.items = selected.items.filter(i => i.listId !== listId || Object.hasOwn(selection, i.productId));
  return stateSchema.parse(selected);
}
export function updateItem(s: AppState, itemId: string, patch: Partial<Pick<ShoppingListItem, 'quantity' | 'status'>>) {
  return change(s, d => {
    const item = activeItems(d).find(i => i.id === itemId);
    if (!item) throw new Error('Somente a lista ativa pode ser alterada.');
    Object.assign(item, patch, { updatedAt: now() });
  });
}
export function removeItem(s: AppState, id: string) {
  return change(s, d => { d.items = d.items.filter(i => i.id !== id || i.listId !== activeList(d).id); });
}
export function finishShopping(s: AppState, policy: 'carry_forward' | 'discard', amountCents: number | null = null) {
  return change(s, d => {
    const previous = activeList(d); const pending = activeItems(d).filter(i => i.status === 'pending');
    previous.status = 'completed'; previous.completedAt = now(); previous.updatedAt = now(); previous.pendingPolicy = pending.length ? policy : 'discard'; previous.amountCents = amountCents;
    const next = { ...meta(d.workspaceId), name: 'Minha lista', status: 'active' as const, completedAt: null, previousListId: previous.id, pendingPolicy: null, amountCents: null, receipt: null };
    d.lists.push(next);
    if (policy === 'carry_forward') d.items.push(...pending.map(i => ({ ...i, ...meta(d.workspaceId), listId: next.id, carriedFromItemId: i.id })));
  });
}
export function saveProduct(s: AppState, input: { id?: string; name: string; categoryId: string; unit?: Product['unit'] }, addToList = false) {
  return change(s, d => {
    const name = input.name.trim().replace(/\s+/g, ' ');
    const current = input.id ? d.products.find(p => p.id === input.id) : undefined;
    // Existing duplicates remain readable/editable; only changes of identity require uniqueness.
    if (!current || normalizeProductName(current.name) !== normalizeProductName(name)) assertUniqueProductName(d.products, name, input.id);
    if (input.id) {
      const p = d.products.find(p => p.id === input.id);
      if (!p) throw new Error('Produto não encontrado.');
      Object.assign(p, { name, categoryId: input.categoryId, unit: input.unit ?? p.unit, updatedAt: now() });
    } else d.products.push({ ...meta(d.workspaceId), name, categoryId: input.categoryId, unit: input.unit ?? 'unid', sortOrder: d.products.length, archivedAt: null });
    if (addToList && !input.id) d.items.push(makeItem(d, d.products.at(-1)!.id, 1));
  });
}
export function restoreAndAdd(s: AppState, id: string) {
  const product = s.products.find(p => p.id === id && !p.deletedAt);
  if (!product) throw new Error('Produto não encontrado.');
  // Already restored by another command? Do not toggle it back to archived.
  const restored = product.archivedAt ? archiveProduct(s, id) : s;
  const next = quickAdd(restored, id);
  next.revision = s.revision + 1;
  return stateSchema.parse(next);
}
export function archiveProduct(s: AppState, id: string) {
  return change(s, d => { const p = d.products.find(p => p.id === id)!; if (p.archivedAt) assertUniqueProductName(d.products, p.name, p.id); p.archivedAt = p.archivedAt ? null : now(); p.updatedAt = now(); });
}
