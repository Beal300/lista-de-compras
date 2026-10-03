import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { stateSchema, receiptSchema, type Receipt, type AppState } from '../src/domain/models';
import { commandSchema, type Command } from '../src/domain/commands';
import { activeList, archiveProduct, finishShopping, initialize, quickAdd, removeItem, reviewSelection, restoreAndAdd, saveProduct, updateItem } from '../src/domain/shopping';

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
      if (version !== 0 && version !== 1 && version !== 2) throw new Error('Versão do banco não suportada. Nenhum dado foi reinicializado.');
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
        if (version !== 2) {
          this.db.exec('CREATE TABLE receipt_previews (token TEXT PRIMARY KEY, purchase_id TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);');
          const migrated = this.read();
          this.db.prepare('UPDATE app_state SET payload=? WHERE id=1').run(JSON.stringify(migrated));
          this.db.pragma('user_version = 2');
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
  preview(purchaseId: string, receipt: Receipt) {
    const purchase = this.read().lists.find(l => l.id === purchaseId && l.status === 'completed');
    if (!purchase) throw new OperationError(422, 'INVALID_PURCHASE', 'Compra não encontrada no histórico.');
    if (purchase.receipt) throw new OperationError(409, 'DUPLICATE_RECEIPT', 'Esta compra já possui uma NFC-e vinculada.');
    const token = randomUUID(); const parsed = receiptSchema.parse(receipt);
    this.db.prepare('DELETE FROM receipt_previews WHERE expires_at < ?').run(Date.now());
    this.db.prepare('INSERT INTO receipt_previews VALUES (?, ?, ?, ?)').run(token, purchaseId, JSON.stringify(parsed), Date.now() + 15 * 60 * 1000);
    return { token, receipt: parsed };
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
      if (a.type === 'saveProduct' && a.addToListId && (a.product.id || a.addToListId !== activeList(state).id)) throw new OperationError(409, 'LIST_CHANGED', 'A lista mudou. Reabra o cadastro.');
      let next: AppState;
      switch (a.type) {
        case 'quickAdd': {
          if (!state.products.some(p => p.id === a.productId && !p.archivedAt && !p.deletedAt)) throw new OperationError(422, 'INVALID_PRODUCT', 'Produto indisponível no catálogo.');
          next = quickAdd(state, a.productId); break;
        }
        case 'restoreAndAdd': next = restoreAndAdd(state, a.productId); break;
        case 'updateItem': next = updateItem(state, a.itemId, a.patch); break;
        case 'removeItem': next = removeItem(state, a.itemId); break;
        case 'reviewSelection': next = reviewSelection(state, a.selection); break;
        case 'finishShopping': next = finishShopping(state, a.policy, a.amountCents); break;
        case 'saveProduct': next = saveProduct(state, a.product, !!a.addToListId); break;
        case 'setPurchaseAmount':
        case 'attachReceipt':
        case 'deleteHistory':
        case 'pruneHistory': {
          next = structuredClone(state);
          const purchase = next.lists.find(l => l.id === ('purchaseId' in a ? a.purchaseId : a.keepId) && l.status === 'completed');
          if (!purchase) throw new OperationError(422, 'INVALID_PURCHASE', 'Compra não encontrada no histórico.');
          if (a.type === 'setPurchaseAmount') { purchase.amountCents = a.amountCents; purchase.updatedAt = new Date().toISOString(); }
          if (a.type === 'attachReceipt') {
            if (purchase.receipt) throw new OperationError(409, 'DUPLICATE_RECEIPT', 'Esta compra já possui uma NFC-e vinculada.');
            const preview = this.db.prepare('SELECT payload FROM receipt_previews WHERE token=? AND purchase_id=? AND expires_at>?').get(a.previewToken, purchase.id, Date.now()) as { payload: string } | undefined;
            if (!preview) throw new OperationError(422, 'PREVIEW_EXPIRED', 'Prévia expirada. Consulte a NFC-e novamente.');
            const receipt = receiptSchema.parse(JSON.parse(preview.payload));
            if (purchase.amountCents !== null && purchase.amountCents !== receipt.totalCents && !a.replaceAmountConfirmed) {
              throw new OperationError(409, 'AMOUNT_CONFIRMATION_REQUIRED', 'O valor da compra difere do total da NFC-e. Confirme a substituição antes de vincular.');
            }
            purchase.receipt = receipt; purchase.amountCents = receipt.totalCents; purchase.updatedAt = new Date().toISOString();
            this.db.prepare('DELETE FROM receipt_previews WHERE token=?').run(a.previewToken);
          }
          if (a.type === 'deleteHistory' || a.type === 'pruneHistory') {
            if (a.type === 'pruneHistory' && state.lists.filter(l => l.status === 'completed').at(-1)?.id !== a.keepId) throw new OperationError(409, 'HISTORY_CHANGED', 'O histórico mudou. Confira a compra mais recente.');
            const removed = new Set(next.lists.filter(l => l.status === 'completed' && (a.type === 'deleteHistory' ? l.id === purchase.id : l.id !== purchase.id)).map(l => l.id));
            const removedItems = new Set(next.items.filter(i => removed.has(i.listId)).map(i => i.id));
            next.lists = next.lists.filter(l => !removed.has(l.id)); next.items = next.items.filter(i => !removed.has(i.listId));
            next.lists.forEach(l => { if (l.previousListId && removed.has(l.previousListId)) l.previousListId = null; });
            next.items.forEach(i => { if (i.carriedFromItemId && removedItems.has(i.carriedFromItemId)) i.carriedFromItemId = null; });
            for (const id of removed) this.db.prepare('DELETE FROM receipt_previews WHERE purchase_id=?').run(id);
          }
          next.revision++; next = stateSchema.parse(next); break;
        }
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
