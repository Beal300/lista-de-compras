import { stateSchema, type AppState } from '../domain/models';

export const STORAGE_KEY = 'lista-compras-inteligente';
export interface Repository { load(): AppState | null; save(state: AppState): void }
// Optimistic concurrency protects against silently overwriting another browser tab.
export class LocalStorageRepository implements Repository {
  private lastRead: string | null | undefined;
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  load() {
    const raw = this.storage.getItem(STORAGE_KEY);
    const parsed = raw === null ? null : stateSchema.parse(JSON.parse(raw));
    this.lastRead = raw;
    return parsed;
  }
  save(state: AppState) {
    const valid = stateSchema.parse(state);
    if (this.lastRead === undefined) throw new Error('Os dados não foram carregados com segurança. Recarregue a página.');
    if (this.storage.getItem(STORAGE_KEY) !== this.lastRead) throw new Error('Os dados mudaram em outra aba. Recarregue antes de continuar.');
    const raw = JSON.stringify(valid);
    this.storage.setItem(STORAGE_KEY, raw);
    this.lastRead = raw;
  }
}
