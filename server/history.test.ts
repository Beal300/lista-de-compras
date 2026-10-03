import { afterEach, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './store';
import { Auth } from './auth';
import { backupDatabase, restoreDatabase } from './backup';
import { parseReceipt } from './nfce';
import { activeList } from '../src/domain/shopping';
import { parseMoney } from '../src/domain/money';
import type { Action } from '../src/domain/commands';
const dirs: string[] = []; const stores: Store[] = [];
function setup() { const dir = mkdtempSync(join(tmpdir(), 'history-')); dirs.push(dir); const store = new Store(join(dir, 'db.sqlite')); stores.push(store); return { store, dir }; }
function send(s: Store, action: Action) { return s.execute({ operationId: randomUUID(), expectedRevision: s.read().revision, action }).state; }
function finish(s: Store, amountCents?: number) { const id = activeList(s.read()).id; send(s, { type: 'finishShopping', listId: id, policy: 'carry_forward', amountCents }); return id; }
const receipt = () => parseReceipt(readFileSync(new URL('./fixtures/nfce-pr.html', import.meta.url), 'utf8'), 'https://www.fazenda.pr.gov.br/nfce/qrcode?p=41250100000000000000650010000000011000000000|2|1|1|0000000000000000000000000000000000000000');
afterEach(() => { for (const s of stores.splice(0)) if (s.db.open) s.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('conclui sem pendentes, permite ausência, inclusão, edição e remoção de valor', () => {
  const { store: s } = setup(); const id = finish(s); expect(s.read().lists[0]).toMatchObject({ amountCents: null, pendingPolicy: 'discard' });
  for (const amountCents of [12345, 0, 56789, null]) { send(s, { type: 'setPurchaseAmount', purchaseId: id, amountCents }); expect(s.read().lists[0].amountCents).toBe(amountCents); }
  expect(() => send(s, { type: 'setPurchaseAmount', purchaseId: activeList(s.read()).id, amountCents: 50 })).toThrow('Compra');
  expect(parseMoney('1.234,56')).toBe(123456); expect(parseMoney('')).toBeNull(); expect(() => parseMoney('1,234')).toThrow();
});
it('exclusão exige confirmação, preserva lista ativa e mantém somente a mais recente', () => {
  const { store: s } = setup(); const first = finish(s, 123); const second = finish(s); const third = finish(s);
  expect(() => send(s, { type: 'deleteHistory', purchaseId: first, confirmed: false } as unknown as Action)).toThrow();
  send(s, { type: 'deleteHistory', purchaseId: second, confirmed: true }); expect(s.read().lists).toHaveLength(3);
  expect(() => send(s, { type: 'pruneHistory', keepId: first, confirmed: true })).toThrow('mudou');
  send(s, { type: 'pruneHistory', keepId: third, confirmed: true }); expect(s.read().lists).toHaveLength(2); expect(s.read().lists[0].id).toBe(third);
});
it('prévia não vincula, exige token da compra e bloqueia duplicação; preserva nota no reinício e backup', async () => {
  const { store: s, dir } = setup(); new Auth(s).setPassword('test-password-123'); const first = finish(s, 100); const second = finish(s); const preview = s.preview(first, receipt());
  expect(s.read().lists[0].receipt).toBeNull();
  expect(() => send(s, { type: 'attachReceipt', purchaseId: second, previewToken: preview.token, confirmed: true })).toThrow('expirada');
  const action: Action = { type: 'attachReceipt', purchaseId: first, previewToken: preview.token, confirmed: true, replaceAmountConfirmed: true };
  const command = { operationId: randomUUID(), expectedRevision: s.read().revision, action };
  s.execute(command); expect(s.execute(command).replayed).toBe(true);
  expect(s.read().lists[0].amountCents).toBe(22765); expect(s.read().lists[0].receipt?.items).toHaveLength(23);
  expect(() => send(s, action)).toThrow('já possui');
  const saved = s.read(); const backup = join(dir, 'backup.sqlite'); await backupDatabase(s.filename, backup); s.close();
  await restoreDatabase(backup, join(dir, 'restored.sqlite'), join(dir, 'backups'), true);
  const restored = new Store(join(dir, 'restored.sqlite')); stores.push(restored); expect(restored.read()).toEqual(saved);
  const reopened = new Store(s.filename); stores.push(reopened); expect(reopened.read()).toEqual(saved);
});
it('migra banco v1 preservando estado e inicializa novos campos', () => {
  const { store: s } = setup(); const before = s.read(); const raw = JSON.parse(JSON.stringify(before)); raw.lists.forEach((l: Record<string, unknown>) => { delete l.amountCents; delete l.receipt; });
  s.db.prepare('UPDATE app_state SET payload=?').run(JSON.stringify(raw)); s.db.exec('DROP TABLE receipt_previews; PRAGMA user_version=1;'); s.close();
  const reopened = new Store(s.filename); stores.push(reopened); expect(reopened.read()).toEqual(before); expect(reopened.db.pragma('user_version', { simple: true })).toBe(2);
});
it('cadastro rápido atômico informa unidade e adiciona quantidade 1', () => {
  const { store: s } = setup(); const state = s.read(); send(s, { type: 'saveProduct', product: { name: 'Novo', categoryId: state.categories[0].id, unit: 'kg' }, addToListId: activeList(state).id });
  expect(s.read().items[0]).toMatchObject({ quantity: 1, productSnapshot: { name: 'Novo', unit: 'kg' } });
});

it('nota preenche valor vazio ou idêntico, mas exige confirmação explícita para substituir', () => {
  const { store: s } = setup();
  for (const initial of [undefined, 22765, 12345]) {
    const purchaseId = finish(s, initial); const preview = s.preview(purchaseId, receipt());
    const action: Action = { type: 'attachReceipt', purchaseId, previewToken: preview.token, confirmed: true };
    if (initial === 12345) {
      const before = s.read(); expect(() => send(s, action)).toThrow('Confirme a substituição'); expect(s.read()).toEqual(before);
      send(s, { ...action, replaceAmountConfirmed: true });
    } else send(s, action);
    expect(s.read().lists.find(l => l.id === purchaseId)?.amountCents).toBe(22765);
    send(s, { type: 'setPurchaseAmount', purchaseId, amountCents: 42 }); expect(s.read().lists.find(l => l.id === purchaseId)?.amountCents).toBe(42);
  }
});
it('confirmação de valor desatualizada não substitui uma edição concorrente', () => {
  const { store: s } = setup(); const purchaseId = finish(s, 10); const preview = s.preview(purchaseId, receipt());
  const command = { operationId: randomUUID(), expectedRevision: s.read().revision, action: { type: 'attachReceipt' as const, purchaseId, previewToken: preview.token, confirmed: true as const, replaceAmountConfirmed: true as const } };
  send(s, { type: 'setPurchaseAmount', purchaseId, amountCents: 20 }); expect(() => s.execute(command)).toThrow('Outra pessoa');
  expect(s.read().lists[0]).toMatchObject({ amountCents: 20, receipt: null });
});
it('restaurar e adicionar é atômico, idempotente por operação e preserva o produto', () => {
  const { store: s } = setup(); const product = s.read().products[0]; send(s, { type: 'archiveProduct', productId: product.id });
  const command = { operationId: randomUUID(), expectedRevision: s.read().revision, action: { type: 'restoreAndAdd' as const, listId: activeList(s.read()).id, productId: product.id } };
  const before = s.read(); s.execute(command); expect(s.execute(command).replayed).toBe(true);
  expect(s.read().products).toHaveLength(before.products.length); expect(s.read().products[0]).toMatchObject({ id: product.id, archivedAt: null }); expect(s.read().items[0].quantity).toBe(1);
  expect(s.read().revision).toBe(before.revision + 1);
});
