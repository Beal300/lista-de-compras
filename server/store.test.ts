import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { Store } from './store';
import { Auth } from './auth';
import { backupDatabase, restoreDatabase } from './backup';
import { acquireLock } from './lock';
import { activeItems, activeList } from '../src/domain/shopping';
import type { Action, Command } from '../src/domain/commands';

const directories: string[] = []; const stores: Store[] = [];
function fixture() { const dir = mkdtempSync(join(tmpdir(), 'shopping-test-')); directories.push(dir); const store = new Store(join(dir, 'shopping.sqlite')); stores.push(store); return { dir, store }; }
function cmd(store: Store, action: Action, revision = store.read().revision): Command { return { operationId: randomUUID(), expectedRevision: revision, action }; }
function quick(store: Store) { const s = store.read(); return cmd(store, { type: 'quickAdd', listId: activeList(s).id, productId: s.products[0].id }); }
afterEach(() => { for (const s of stores.splice(0)) if (s.db.open) s.close(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('SQLite e concorrência', () => {
  it('inicializa uma vez com catálogo completo e lista vazia e preserva edições após reinício', () => {
    const { store } = fixture(); const initial = store.read(); expect(initial.products).toHaveLength(92); expect(initial.categories).toHaveLength(3); expect(initial.items).toHaveLength(0);
    store.execute(quick(store)); store.execute(cmd(store, { type: 'saveProduct', product: { id: initial.products[0].id, name: 'Produto editado', categoryId: initial.categories[1].id } }));
    const saved = store.read(); store.close(); const reopened = new Store(store.filename); stores.push(reopened); expect(reopened.read()).toEqual(saved);
  });
  it('aceita dois incrementos baseados na mesma revisão, mas não repete a mesma operação', () => {
    const { store } = fixture(); const first = quick(store); const second = quick(store);
    store.execute(first); store.execute(second); expect(activeItems(store.read())[0].quantity).toBe(2);
    expect(store.execute(first).replayed).toBe(true); expect(activeItems(store.read())[0].quantity).toBe(2);
    store.close(); const reopened = new Store(store.filename); stores.push(reopened);
    expect(reopened.execute(second).replayed).toBe(true); expect(activeItems(reopened.read())[0].quantity).toBe(2);
    expect(() => reopened.execute({ ...second, action: { type: 'finishShopping', listId: activeList(reopened.read()).id, policy: 'discard' } })).toThrow('Identificador');
  });
  it('rejeita quantidade absoluta e revisão completa desatualizadas sem perder dados', () => {
    const { store } = fixture(); store.execute(quick(store)); const state = store.read(); const item = activeItems(state)[0];
    store.execute(quick(store));
    expect(() => store.execute(cmd(store, { type: 'updateItem', listId: item.listId, itemId: item.id, patch: { quantity: 9 } }, state.revision))).toThrow('Outra pessoa');
    expect(() => store.execute(cmd(store, { type: 'reviewSelection', listId: item.listId, selection: {} }, state.revision))).toThrow('Outra pessoa');
    expect(activeItems(store.read())[0].quantity).toBe(2);
  });
  it('finalização é atômica, preserva histórico e bloqueia comandos da lista anterior', () => {
    const { store } = fixture(); const stale = quick(store); store.execute(quick(store));
    const old = store.read(); const finish = cmd(store, { type: 'finishShopping', listId: activeList(old).id, policy: 'carry_forward' });
    const result = store.execute(finish).state;
    expect(result.lists).toHaveLength(2); expect(result.items[0]).toEqual(old.items[0]); expect(activeItems(result)).toHaveLength(1);
    expect(() => store.execute(stale)).toThrow('já foi finalizada');
    expect(store.execute(finish).state.lists).toHaveLength(2);
  });
  it('grava estado e recibo juntos e faz rollback em falha de persistência', () => {
    const { store } = fixture(); const before = store.read();
    store.db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'disk simulation'); END;");
    expect(() => store.execute(quick(store))).toThrow('disk simulation'); expect(store.read()).toEqual(before);
    expect(store.db.prepare('SELECT count(*) n FROM operations').get()).toEqual({ n: 0 });
  });
  it('valida payload e limites sem gravar dados inválidos', () => {
    const { store } = fixture(); store.execute(quick(store)); const state = store.read(); const item = state.items[0];
    expect(() => store.execute(cmd(store, { type: 'updateItem', listId: item.listId, itemId: item.id, patch: { quantity: 0 } }))).toThrow();
    store.execute(cmd(store, { type: 'updateItem', listId: item.listId, itemId: item.id, patch: { quantity: 9999 } }));
    expect(() => store.execute(quick(store))).toThrow(); expect(store.read().items[0].quantity).toBe(9999);
  });
  it('recusa banco corrompido ou versão futura sem reinicializar', () => {
    const { store } = fixture(); store.db.pragma('user_version = 99'); store.close();
    expect(() => new Store(store.filename)).toThrow('Versão');
    const inspect = new Database(store.filename); expect(inspect.pragma('user_version', { simple: true })).toBe(99); inspect.close();
  });
});

describe('acesso e recuperação', () => {
  it('armazena apenas verificador, persiste sessões, expira e revoga ao alterar senha', () => {
    const { store } = fixture(); const auth = new Auth(store); const password = 'senha-apenas-de-teste'; auth.setPassword(password);
    expect(JSON.stringify(store.db.prepare('SELECT * FROM settings').all())).not.toContain(password);
    expect(auth.login('errada', 'client')).toBeNull(); const session = auth.login(password, 'client')!;
    expect(auth.authorized(session.token)).toBe(true);
    expect(JSON.stringify(store.db.prepare('SELECT * FROM sessions').all())).not.toContain(session.token);
    store.close(); const again = new Store(store.filename); stores.push(again); const nextAuth = new Auth(again); expect(nextAuth.authorized(session.token)).toBe(true);
    again.db.prepare('UPDATE sessions SET expires_at=0').run(); expect(nextAuth.authorized(session.token)).toBe(false);
    const second = nextAuth.login(password, 'client')!; nextAuth.setPassword('outra-senha-de-teste', true); expect(nextAuth.authorized(second.token)).toBe(false);
  });
  it('limita tentativas inclusive entre reinícios', () => {
    const { store } = fixture(); const auth = new Auth(store); auth.setPassword('senha-apenas-de-teste');
    for (let i = 0; i < 10; i++) auth.login('incorreta', 'client');
    store.close(); const reopened = new Store(store.filename); stores.push(reopened);
    expect(new Auth(reopened).login('senha-apenas-de-teste', 'client')).toBeNull();
  });
  it('backup com banco em uso é consistente e restauração exige confirmação', async () => {
    const { store, dir } = fixture(); new Auth(store).setPassword('senha-apenas-de-teste');
    store.execute(quick(store)); const before = store.read(); const backup = join(dir, 'backup.sqlite');
    await backupDatabase(store.filename, backup);
    expect(existsSync(`${backup}-wal`)).toBe(false); expect(existsSync(`${backup}-shm`)).toBe(false);
    store.execute(quick(store)); store.close();
    await expect(restoreDatabase(backup, store.filename, join(dir, 'backups'), false)).rejects.toThrow('confirmação');
    const previous = await restoreDatabase(backup, store.filename, join(dir, 'backups'), true); expect(previous).toBeTruthy();
    const restored = new Store(store.filename); stores.push(restored); expect(restored.read()).toEqual(before);
    const old = new Store(previous!); stores.push(old); expect(old.read().items[0].quantity).toBe(2);
    await expect(backupDatabase(store.filename, backup)).rejects.toThrow('já existe');
  });
  it('bloqueia restauração enquanto o processo do servidor estiver ativo', () => {
    const { dir } = fixture(); const lock = join(dir, 'server.lock'); const release = acquireLock(lock);
    expect(() => acquireLock(lock)).toThrow('execução'); release(); const again = acquireLock(lock); again();
  });
  it('backup inválido não substitui a base', async () => {
    const { store, dir } = fixture(); const state = store.read(); const invalid = join(dir, 'invalid.sqlite'); writeFileSync(invalid, 'invalid');
    await expect(restoreDatabase(invalid, store.filename, join(dir, 'backups'), true)).rejects.toThrow(); expect(store.read()).toEqual(state);
  });
});
