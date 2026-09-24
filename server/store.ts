import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { stateSchema, type AppState } from '../src/domain/models';
import { commandSchema, type Command } from '../src/domain/commands';
import { activeList, archiveProduct, finishShopping, initialize, quickAdd, removeItem, reviewSelection, saveProduct, updateItem } from '../src/domain/shopping';

export class OperationError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export class Store {
  readonly db: Database.Database;
  constructor(public readonly filename: string) {
    mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename, { timeout: 5000 });
    try {
      const version = this.db.pragma('user_version', { simple: true });
      if (version !== 0 && version !== 1) throw new Error('Versão do banco não suportada. Nenhum dado foi reinicializado.');
      this.db.pragma('journal_mode = WAL'); this.db.pragma('synchronous = FULL');
      this.db.transaction(() => {
        if (version === 0) {
          const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
          if (tables.length) throw new Error('Banco existente sem versão reconhecida. Inicialização interrompida.');
          this.db.exec(`
            CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE operations (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, created_at INTEGER NOT NULL);
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
            CREATE TABLE login_attempts (client TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
            PRAGMA user_version = 1;
          `);
          const state = initialize(false);
          this.db.prepare('INSERT INTO app_state VALUES (1, ?, ?)').run(state.revision, JSON.stringify(state));
        }
        this.read();
      }).immediate();
    } catch (error) { this.db.close(); throw error; }
  }
  read(): AppState {
    const row = this.db.prepare('SELECT revision, payload FROM app_state WHERE id=1').get() as { revision: number; payload: string } | undefined;
    if (!row) throw new Error('Estado compartilhado ausente. O banco foi preservado.');
    const state = stateSchema.parse(JSON.parse(row.payload));
    if (state.revision !== row.revision) throw new Error('Revisão do banco inconsistente.');
    return state;
  }
  execute(input: Command) {
    const command = commandSchema.parse(input);
    const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
    return this.db.transaction(() => {
      const previous = this.db.prepare('SELECT fingerprint FROM operations WHERE id=?').get(command.operationId) as { fingerprint: string } | undefined;
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new OperationError(409, 'OPERATION_REUSED', 'Identificador já utilizado para outra operação.');
        return { state: this.read(), replayed: true };
      }
      const state = this.read(); const a = command.action;
      if ('listId' in a && a.listId !== activeList(state).id) throw new OperationError(409, 'LIST_CHANGED', 'Esta compra já foi finalizada. Revise a nova lista antes de continuar.');
      if (command.expectedRevision > state.revision || (a.type !== 'quickAdd' && command.expectedRevision !== state.revision)) {
        throw new OperationError(409, 'REVISION_CONFLICT', 'Outra pessoa alterou os dados. Suas edições não foram salvas. Revise a versão atual antes de tentar novamente.');
      }
      let next: AppState;
      switch (a.type) {
        case 'quickAdd': {
          if (!state.products.some(p => p.id === a.productId && !p.archivedAt && !p.deletedAt)) throw new OperationError(422, 'INVALID_PRODUCT', 'Produto indisponível no catálogo.');
          next = quickAdd(state, a.productId); break;
        }
        case 'updateItem': next = updateItem(state, a.itemId, a.patch); break;
        case 'removeItem': next = removeItem(state, a.itemId); break;
        case 'reviewSelection': next = reviewSelection(state, a.selection); break;
        case 'finishShopping': next = finishShopping(state, a.policy); break;
        case 'saveProduct': next = saveProduct(state, a.product); break;
        case 'archiveProduct': {
          if (!state.products.some(p => p.id === a.productId)) throw new OperationError(422, 'INVALID_PRODUCT', 'Produto não encontrado.');
          next = archiveProduct(state, a.productId); break;
        }
      }
      this.db.prepare('UPDATE app_state SET revision=?, payload=? WHERE id=1').run(next.revision, JSON.stringify(next));
      this.db.prepare('INSERT INTO operations VALUES (?, ?, ?, ?)').run(command.operationId, fingerprint, next.revision, Date.now());
      return { state: next, replayed: false };
    }).immediate();
  }
  backup(filename: string) { return this.db.backup(filename); }
  close() { this.db.close(); }
}
